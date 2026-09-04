import os
import unittest

os.environ.setdefault("AGORA_APP_ID", "test-app-id")
os.environ.setdefault("AGORA_APP_CERTIFICATE", "test-certificate")

from app.orchestrator.llm_host import HostAction, legal_host_actions
from app.orchestrator.agent_launcher import INACTIVE_REMOTE_UID
from app.orchestrator.conversation import shared_candidate_context
from app.orchestrator.scorer import ScoreResult
from app.orchestrator.state import SessionState, TranscriptTurn
from app.question_banks.enterprise import hydrate_panel_banks
from app.schemas.panel import Panel
from app.routes.sessions import _scheduled_kind_candidates, _test_case_score
from app.schemas.panel import KnowledgeItem


def panel_payload():
    def agent(agent_id: str):
        return {
            "id": agent_id,
            "identity": {"name": agent_id, "role": "Technical", "color": "#fff", "avatar": ""},
            "behavior": {"systemPrompt": "Stay in role.", "greetingMessage": "", "fallbackMessage": "", "scenarioBrief": ""},
            "logic": {"difficultyBand": [1, 5], "seedQuestions": [], "followUpAggressiveness": 4,
                      "maxTurns": 2, "maxVisits": 1, "questionKinds": ["verbal"],
                      "maxRetriesPerQuestion": 1, "vagueProbing": True},
            "knowledge": {"mode": "knowledge_base", "strict": True, "sourceName": "test", "bankId": "custom",
                          "items": [{"id": f"{agent_id}-q1", "question": "Explain it.", "idealAnswer": "Clearly.", "kind": "verbal"},
                                    {"id": f"{agent_id}-q2", "question": "Compare it.", "idealAnswer": "Carefully.", "kind": "verbal"}]},
            "skills": {"rolePlayMode": False, "loopUntilSatisfied": False, "contradictionProbing": False},
            "tools": [], "turnTaking": {"canOpen": agent_id == "a", "handoffTriggers": "", "priority": "medium"},
            "scoring": {"competencies": ["clarity"]},
        }
    return {"projectName": "Flow", "agents": [agent("a"), agent("b")], "scorer": {"competencies": []}}


class LlmHostFlowTests(unittest.TestCase):
    def setUp(self):
        self.panel = Panel.model_validate(panel_payload())
        self.state = SessionState(session_id="s", panel_project_name="Flow", current_agent_id="a", host_phase="interview")
        self.state.get_agent_state("a").pending_item_id = "a-q1"

    def test_legacy_panel_upgrades_to_ordered_steps(self):
        flow = self.panel.resolved_flow()
        self.assertEqual([step.agentId for step in flow.steps], ["a", "b"])
        self.assertEqual(flow.steps[0].questionKinds, ["verbal"])
        self.assertEqual(flow.steps[0].maxRetriesPerQuestion, 1)

    def test_inactive_specialist_uid_fits_agora_numeric_range(self):
        self.assertGreaterEqual(int(INACTIVE_REMOTE_UID), 0)
        self.assertLessEqual(int(INACTIVE_REMOTE_UID), (2 ** 31) - 1)

    def test_coding_score_is_exact_passed_test_ratio(self):
        self.assertEqual(_test_case_score(7, 10), 0.7)
        self.assertEqual(_test_case_score(10, 10), 1.0)
        self.assertEqual(_test_case_score(0, 10), 0.0)

    def test_question_kind_configuration_is_an_ordered_schedule(self):
        items = [
            KnowledgeItem(id="v1", question="Explain.", kind="verbal"),
            KnowledgeItem(id="c1", question="Implement.", kind="coding"),
            KnowledgeItem(id="v2", question="Compare.", kind="verbal"),
            KnowledgeItem(id="c2", question="Implement another.", kind="coding"),
        ]
        first = _scheduled_kind_candidates(items, [], ["coding", "verbal"])
        self.assertEqual([item.id for item in first], ["c1", "c2"])
        second = _scheduled_kind_candidates(items, ["c1"], ["coding", "verbal"])
        self.assertEqual([item.id for item in second], ["v1", "v2"])

    def test_legacy_frontend_template_gets_executable_dsa_contracts(self):
        payload = panel_payload()
        technical = payload["agents"][0]
        technical["knowledge"] = {
            "mode": "knowledge_base", "strict": True,
            "sourceName": "RecruitPro reviewed questions", "bankId": "custom",
            "items": [
                {"id": "react-reconciliation", "question": "Explain React keys.", "kind": "verbal"},
                {"id": "frontend-state", "question": "Design frontend state.", "kind": "written"},
                {"id": "lru-cache", "question": "Implement LRU.", "kind": "coding"},
            ],
        }
        panel = Panel.model_validate(payload)
        hydrated, contracts = hydrate_panel_banks(panel, "new-test-session")
        upgraded = hydrated.agents[0]
        self.assertEqual(upgraded.knowledge.bankId, "dsa")
        self.assertGreaterEqual(len(upgraded.knowledge.items), 10)
        self.assertTrue(contracts)
        self.assertTrue(all("test_cases" in contract for contract in contracts.values()))

    def test_vague_answer_exposes_bounded_retry(self):
        result = ScoreResult(competency_scores={}, flags=["vague"], triggered_agent_ids=[])
        legal, fallback = legal_host_actions(self.state, self.panel, result, gave_up=False)
        self.assertIn(HostAction.RETRY, legal)
        self.assertEqual(fallback.action, HostAction.RETRY)
        self.state.get_agent_state("a").retries_by_item["a-q1"] = 1
        legal, _ = legal_host_actions(self.state, self.panel, result, gave_up=False)
        self.assertNotIn(HostAction.RETRY, legal)

    def test_partial_answer_exposes_an_adaptive_probe(self):
        result = ScoreResult(
            competency_scores={"clarity": 0.5}, flags=[], triggered_agent_ids=[],
            coverage=0.5, missing_points=["customer impact"], answer_correct=False,
        )
        legal, fallback = legal_host_actions(self.state, self.panel, result, gave_up=False)
        self.assertEqual(legal, [HostAction.RETRY])
        self.assertEqual(fallback.action, HostAction.RETRY)

    def test_cross_role_handoff_precedes_same_role_probe(self):
        result = ScoreResult(
            competency_scores={}, flags=["vague"], triggered_agent_ids=["b"],
            coverage=0.4, answer_correct=False,
        )
        legal, fallback = legal_host_actions(self.state, self.panel, result, gave_up=False)
        self.assertEqual(legal, [HostAction.HANDOFF])
        self.assertEqual(fallback.next_agent_id, "b")

    def test_assessment_satisfaction_is_independent_of_candidate_score(self):
        result = ScoreResult(
            competency_scores={"clarity": 0.1}, flags=[], triggered_agent_ids=[],
            coverage=0.1, answer_correct=False, assessment_satisfaction=0.9,
        )
        legal, fallback = legal_host_actions(self.state, self.panel, result, gave_up=False)
        self.assertEqual(legal, [HostAction.HANDOFF])
        self.assertEqual(fallback.next_agent_id, "b")
        self.assertIn("round robin", fallback.reason)

    def test_shared_context_links_question_to_candidate_evidence(self):
        self.state.transcript.append(TranscriptTurn(
            turn_number=1, agent_id="a", speaker="candidate", text="It improves latency.",
            knowledge_item_id="a-q1", flags=["vague"],
        ))
        context = shared_candidate_context(self.panel.agents, self.state.transcript)
        self.assertIn("Explain it.", context)
        self.assertIn("It improves latency.", context)
        self.assertIn("vague", context)

    def test_question_count_forces_validated_handoff_then_close(self):
        result = ScoreResult(
            competency_scores={}, flags=[], triggered_agent_ids=[],
            coverage=1.0, answer_correct=True,
        )
        self.state.get_agent_state("a").asked_item_ids = ["a-q1", "a-q2"]
        legal, fallback = legal_host_actions(self.state, self.panel, result, gave_up=False)
        self.assertEqual(legal, [HostAction.HANDOFF])
        self.assertEqual(fallback.next_agent_id, "b")
        self.state.flow_step_index = 1
        self.state.current_agent_id = "b"
        self.state.get_agent_state("b").asked_item_ids = ["b-q1", "b-q2"]
        legal, fallback = legal_host_actions(self.state, self.panel, result, gave_up=False)
        self.assertEqual(legal, [HostAction.CLOSE])
        self.assertEqual(fallback.action, HostAction.CLOSE)

    def test_round_robin_wraps_to_next_unsatisfied_agent(self):
        result = ScoreResult(
            competency_scores={}, flags=[], triggered_agent_ids=[],
            coverage=1.0, answer_correct=True, assessment_satisfaction=0.4,
        )
        self.state.flow_step_index = 1
        self.state.current_agent_id = "b"
        self.state.get_agent_state("b").pending_item_id = "b-q1"
        self.state.get_agent_state("b").asked_item_ids = ["b-q1"]
        legal, fallback = legal_host_actions(self.state, self.panel, result, gave_up=False)
        self.assertEqual(legal, [HostAction.HANDOFF])
        self.assertEqual(fallback.next_agent_id, "a")

    def test_round_robin_skips_an_agent_above_its_satisfaction_threshold(self):
        result = ScoreResult(
            competency_scores={}, flags=[], triggered_agent_ids=[],
            coverage=1.0, answer_correct=True, assessment_satisfaction=0.4,
        )
        self.state.get_agent_state("a").asked_item_ids = ["a-q1"]
        self.state.get_agent_state("b").assessment_satisfaction = 0.9
        legal, fallback = legal_host_actions(self.state, self.panel, result, gave_up=False)
        self.assertEqual(legal, [HostAction.NEXT_QUESTION])
        self.assertEqual(fallback.next_agent_id, "a")


if __name__ == "__main__":
    unittest.main()
