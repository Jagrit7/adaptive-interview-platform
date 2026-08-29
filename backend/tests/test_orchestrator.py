"""Run from the backend folder:   python -m tests.test_orchestrator
Paths are resolved relative to this file, so it works wherever the repo lives."""
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent          # .../backend
PROJECT = BACKEND.parent                                   # .../adaptive-interview-platform
sys.path.insert(0, str(BACKEND))

from app.orchestrator.orchestrator import build_initial_queue, decide_next_step, apply_score_result, seed_agent_states, ActionType
from app.orchestrator.state import SessionState
from app.orchestrator.scorer import ScoreResult
from app.schemas.panel import Panel


def agent(aid, canOpen=False, prio="medium", comps=None, maxTurns=3, maxVisits=2, trig="", kb=None):
    return {
        "id": aid,
        "identity": {"name": aid, "role": "Technical", "color": "#fff", "avatar": ""},
        "behavior": {"systemPrompt": "p", "greetingMessage": "g", "fallbackMessage": "f", "scenarioBrief": ""},
        "logic": {"difficultyBand": [3, 7], "seedQuestions": [], "followUpAggressiveness": 5,
                  "maxTurns": maxTurns, "maxVisits": maxVisits},
        "knowledge": kb or {"mode": "llm"},
        "skills": {"rolePlayMode": False, "loopUntilSatisfied": True, "contradictionProbing": False},
        "tools": [],
        "turnTaking": {"canOpen": canOpen, "handoffTriggers": trig, "priority": prio},
        "scoring": {"competencies": comps if comps is not None else ["C1"]},
    }


ok = lambda s: print(f"  PASS  {s}")
empty = ScoreResult(competency_scores={}, flags=[], triggered_agent_ids=[])

print("\n=== A. Queue: openers first, by priority ===")
p = Panel(projectName="x", agents=[agent("low", True, "low"), agent("hi", True, "high"), agent("none")])
assert build_initial_queue(p.agents) == ["hi", "low", "none"]
try:
    build_initial_queue(Panel(projectName="x", agents=[agent("a")]).agents)
    raise AssertionError("should have raised")
except ValueError as e:
    assert "canOpen" in str(e)
ok("priority order correct; no-opener raises a usable message")

print("\n=== B. Strict KB agent ends its visit when the bank runs out ===")
kb = {"mode": "knowledge_base", "strict": True,
      "items": [{"id": "q1", "question": "Q1"}, {"id": "q2", "question": "Q2"}]}
p = Panel(projectName="x", agents=[agent("a", True, "high", kb=kb, maxTurns=99, maxVisits=5), agent("b")])
st = SessionState(session_id="s", panel_project_name="x", current_agent_id="a", queue=["b"])
seed_agent_states(st, p)
ast = st.get_agent_state("a")
ast.asked_item_ids = ["q1"]
ast.bank_exhausted = False
apply_score_result(st, p.agents[0], empty, {"C1": 0.7})
assert decide_next_step(st, p, empty).action == ActionType.FOLLOW_UP
ok("questions remain -> FOLLOW_UP (maxTurns not hit, not satisfied)")

ast.asked_item_ids = ["q1", "q2"]
ast.bank_exhausted = True
d = decide_next_step(st, p, empty)
assert d.action == ActionType.SWITCH_AGENT and d.next_agent_id == "b", d
assert ast.force_closed and "a" not in st.queue
ok("bank spent -> visit ends, agent force-closed, not requeued to burn visits")

print("\n=== C. Guided (non-strict) KB agent improvises past the bank ===")
p2 = Panel(projectName="x", agents=[agent("a", True, "high", kb=dict(kb, strict=False), maxTurns=99, maxVisits=5), agent("b")])
st2 = SessionState(session_id="s", panel_project_name="x", current_agent_id="a", queue=["b"])
seed_agent_states(st2, p2)
a2 = st2.get_agent_state("a")
a2.asked_item_ids = ["q1", "q2"]
a2.bank_exhausted = True
apply_score_result(st2, p2.agents[0], empty, {"C1": 0.7})
assert decide_next_step(st2, p2, empty).action == ActionType.FOLLOW_UP
ok("guided mode keeps going instead of stopping")

print("\n=== D. Handoff trigger: state and decision now agree (bug fix) ===")
p3 = Panel(projectName="x", agents=[agent("a", True, "high"), agent("b"), agent("c")])
st3 = SessionState(session_id="s", panel_project_name="x", current_agent_id="a", queue=["b", "c"])
seed_agent_states(st3, p3)
r = ScoreResult(competency_scores={}, flags=[], triggered_agent_ids=["c"])
apply_score_result(st3, p3.agents[0], r, {})
d = decide_next_step(st3, p3, r)
assert d.action == ActionType.SWITCH_AGENT and d.next_agent_id == "c"
assert st3.current_agent_id == "c", f"state says {st3.current_agent_id}, decision says c"
assert "c" not in st3.queue and "a" in st3.queue and "b" in st3.queue
ok("swapped-in agent matches state; target removed from queue; interrupted agent requeued")

r2 = ScoreResult(competency_scores={}, flags=[], triggered_agent_ids=["ghost-id"])
st4 = SessionState(session_id="s", panel_project_name="x", current_agent_id="a", queue=["b"])
seed_agent_states(st4, p3)
apply_score_result(st4, p3.agents[0], r2, {})
assert decide_next_step(st4, p3, r2).action == ActionType.FOLLOW_UP
ok("hallucinated agent id ignored rather than raising KeyError mid-interview")

print("\n=== E. Per-competency thresholds, best-score retention ===")
p4 = Panel(projectName="x", agents=[agent("a", True, "high", comps=["C1", "C2"])],
           scorer={"competencies": [{"name": "C1", "weight": 1, "threshold": 0.5},
                                    {"name": "C2", "weight": 1, "threshold": 0.9}]})
st5 = SessionState(session_id="s", panel_project_name="x", current_agent_id="a", queue=[])
r3 = ScoreResult(competency_scores={"C1": 0.6, "C2": 0.6}, flags=[], triggered_agent_ids=[])
apply_score_result(st5, p4.agents[0], r3, {"C1": 0.5, "C2": 0.9})
s = st5.get_agent_state("a")
assert s.competency_scores["C1"].covered and not s.competency_scores["C2"].covered
assert s.satisfaction() == 0.5
ok("thresholds applied per competency, not one global number")

r4 = ScoreResult(competency_scores={"C1": 0.4, "C2": 0.95}, flags=[], triggered_agent_ids=[])
apply_score_result(st5, p4.agents[0], r4, {"C1": 0.5, "C2": 0.9})
assert s.competency_scores["C1"].score == 0.6, "best score must be kept, not overwritten by a worse turn"
assert s.satisfaction() == 1.0
assert decide_next_step(st5, p4, r4).action == ActionType.FINISHED and st5.is_finished
ok("best-so-far retained; fully satisfied + empty queue -> FINISHED")

print("\n=== F. Unscored agent is NOT treated as satisfied (the seeding fix) ===")
p5 = Panel(projectName="x", agents=[agent("a", True, "high", comps=["C1"], maxTurns=9), agent("b")])
st6 = SessionState(session_id="s", panel_project_name="x", current_agent_id="a", queue=["b"])
seed_agent_states(st6, p5)
assert st6.get_agent_state("a").satisfaction() == 0.0, "declared competency must start uncovered"
apply_score_result(st6, p5.agents[0], empty, {"C1": 0.7})
assert decide_next_step(st6, p5, empty).action == ActionType.FOLLOW_UP
ok("agent with declared competencies keeps going before its first score lands")

p6 = Panel(projectName="x", agents=[agent("a", True, "high", comps=[]), agent("b")])
st7 = SessionState(session_id="s", panel_project_name="x", current_agent_id="a", queue=["b"])
seed_agent_states(st7, p6)
assert st7.get_agent_state("a").satisfaction() == 1.0
ok("agent with genuinely no competencies still resolves as satisfied")

print("\n=== G. Scorer tolerates a sloppy JSON response ===")
sr = ScoreResult(**{"competency_scores": {"C1": 0.8}, "flags": [], "triggered_agent_ids": [],
                    "coverage": None, "missing_points": []})
assert sr.coverage is None and sr.missing_points == []
ok("optional coverage/missing_points fields default cleanly")

print("\nAll orchestrator checks passed.\n")
