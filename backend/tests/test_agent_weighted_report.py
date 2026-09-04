import os
import sys
import unittest
from pathlib import Path


BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("AGORA_APP_ID", "test-app-id")
os.environ.setdefault("AGORA_APP_CERTIFICATE", "test-cert")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")

from app.orchestrator.report import build_report
from app.orchestrator.state import AgentSessionState, CompetencyScore, SessionState
from app.schemas.panel import Panel


def agent(agent_id: str, weight: float | None, competencies: list[str]) -> dict:
    return {
        "id": agent_id,
        "identity": {"name": agent_id.title(), "role": "Technical", "color": "#000", "avatar": ""},
        "behavior": {"systemPrompt": "Interview.", "greetingMessage": "Hello", "fallbackMessage": "Again", "scenarioBrief": ""},
        "logic": {"difficultyBand": [1, 5], "seedQuestions": [], "followUpAggressiveness": 1, "maxTurns": 2},
        "skills": {"rolePlayMode": False, "loopUntilSatisfied": False, "contradictionProbing": False},
        "turnTaking": {"canOpen": agent_id == "technical", "handoffTriggers": "done", "priority": "medium"},
        "scoring": {"competencies": competencies, "weight": weight},
    }


class AgentWeightedReportTests(unittest.TestCase):
    def test_overall_is_weighted_mean_of_agent_scores(self):
        panel = Panel.model_validate({
            "projectName": "Weighted panel",
            "agents": [
                agent("technical", 0.75, ["Correctness", "Reasoning"]),
                agent("communication", 0.25, ["Clarity"]),
            ],
            "scorer": {"competencies": []},
        })
        state = SessionState(
            session_id="session",
            panel_project_name="Weighted panel",
            started_at="2026-09-03T00:00:00+00:00",
            finished_at="2026-09-03T00:10:00+00:00",
            is_finished=True,
            agent_states={
                "technical": AgentSessionState(agent_id="technical", assessment_satisfaction=0.95, competency_scores={
                    "Correctness": CompetencyScore(score=0.9, covered=True),
                    "Reasoning": CompetencyScore(score=0.7, covered=True),
                }),
                "communication": AgentSessionState(agent_id="communication", competency_scores={
                    "Clarity": CompetencyScore(score=0.4, covered=False),
                }),
            },
        )

        report = build_report(state, panel)

        self.assertEqual(report.totals.overall_score, 0.7)
        by_id = {item.agent_id: item for item in report.agents}
        self.assertEqual(by_id["technical"].score, 0.8)
        self.assertEqual(by_id["technical"].satisfaction, 0.95)
        self.assertEqual(by_id["technical"].weight, 0.75)
        self.assertEqual(by_id["communication"].score, 0.4)
        self.assertEqual(by_id["communication"].weight, 0.25)

    def test_legacy_panel_derives_agent_weights_from_old_rubric(self):
        panel = Panel.model_validate({
            "projectName": "Legacy panel",
            "agents": [
                agent("technical", None, ["Correctness"]),
                agent("communication", None, ["Clarity"]),
            ],
            "scorer": {"competencies": [
                {"name": "Correctness", "weight": 80, "threshold": 0.7},
                {"name": "Clarity", "weight": 20, "threshold": 0.7},
            ]},
        })
        state = SessionState(
            session_id="legacy",
            panel_project_name="Legacy panel",
            agent_states={
                "technical": AgentSessionState(agent_id="technical", competency_scores={"Correctness": CompetencyScore(score=1, covered=True)}),
                "communication": AgentSessionState(agent_id="communication", competency_scores={"Clarity": CompetencyScore(score=0, covered=False)}),
            },
        )

        report = build_report(state, panel)

        self.assertEqual(report.totals.overall_score, 0.8)
        self.assertEqual([item.weight for item in report.agents], [0.8, 0.2])


if __name__ == "__main__":
    unittest.main()
