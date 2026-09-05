"""End-to-end: boots the real FastAPI app and drives a full interview.

Only two things are faked, and only because they leave the machine:
  - the Agora session object (records think()/update() calls instead of speaking)
  - the Groq scoring call (returns scripted scores)
Everything else - routing, validation, the language registry, the knowledge
parser, the orchestrator - is the real code.
"""
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent          # .../backend
PROJECT = BACKEND.parent                                   # .../adaptive-interview-platform
sys.path.insert(0, str(BACKEND))
import asyncio
import json
import os

os.environ.setdefault("AGORA_APP_ID", "test-app-id")
os.environ.setdefault("AGORA_APP_CERTIFICATE", "test-cert")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")


from fastapi import HTTPException
from fastapi.testclient import TestClient

import app.orchestrator.agent_launcher as launcher
import app.routes.sessions as sessions_route
from app.orchestrator.scorer import ScoreResult

ok = lambda s: print(f"  PASS  {s}")
fail = []


# ----------------------------------------------------------------- fakes ----
class FakeAgoraSession:
    """Records what the backend would have sent to a live agent."""
    def __init__(self):
        self.thoughts: list[str] = []
        self.updates: list[dict] = []
        self.stop_count = 0

    def think(self, text, *, on_listening_action=None, on_speaking_action=None,
              on_thinking_action=None, interruptable=None, metadata=None, options=None):
        # Mirrors the real keyword-only signature. Both assertions matter: API
        # v2.7 defaults on_listening_action to "interrupt", which would cut the
        # candidate off every time a question is injected.
        assert on_listening_action == "inject", (
            f"think() must not interrupt the candidate, got {on_listening_action!r}")
        assert on_speaking_action in {"append", "interrupt"}, on_speaking_action
        assert on_thinking_action in {"append", "interrupt"}, on_thinking_action
        self.thoughts.append(text)

    def update(self, properties):
        # Mirrors the real signature: ONE positional arg. If the code ever
        # regresses to update(llm=..., tts=...) this raises, like the SDK does.
        assert isinstance(properties, dict), "update() must receive a dict"
        self.updates.append(properties)

    def stop(self):
        self.stop_count += 1


FAKE_SESSION = FakeAgoraSession()
STARTED_WITH = {}


def fake_start_session_agent(agent, channel, remote_uid, language=None, voice_id=None, **kwargs):
    # Exercise the real registry so a bad voice/language would still blow up here.
    stt = launcher.build_stt(language).to_config()
    tts = launcher.build_tts(language, voice_id).to_config()
    STARTED_WITH.update({
        "agent_id": agent.id, "language": language, "voice_id": voice_id,
        "stt": stt, "tts": tts,
        "system_prompt": launcher.build_system_prompt_from_agent(
            agent, language, kwargs.get("boundary_instruction", "")
        ),
    })
    return "agora-instance-123", FAKE_SESSION


SCRIPT: list[ScoreResult] = []


async def fake_score_turn(current_agent, all_agents, transcript_so_far, latest_answer,
                          asked_item_id=None, language=None):
    SCORE_CALLS.append({"agent": current_agent.id, "asked_item_id": asked_item_id,
                        "answer": latest_answer, "transcript_len": len(transcript_so_far),
                        "language": language})
    return SCRIPT.pop(0) if SCRIPT else ScoreResult(
        competency_scores={}, flags=[], triggered_agent_ids=[])


SCORE_CALLS: list[dict] = []

sessions_route.start_session_agent = fake_start_session_agent
sessions_route.score_turn = fake_score_turn

from app.main import app  # noqa: E402  (patched before import on purpose)

client = TestClient(app)


# ------------------------------------------------------------ panel setup ----
def agent(aid, name, canOpen=False, prio="medium", comps=None, maxTurns=10, maxVisits=2,
          trig="", kb=None):
    return {
        "id": aid,
        "identity": {"name": name, "role": "Technical", "color": "#6366f1", "avatar": ""},
        "behavior": {"systemPrompt": f"You are {name}.", "greetingMessage": "Hi, ready?",
                     "fallbackMessage": "Say again?", "scenarioBrief": ""},
        "logic": {"difficultyBand": [3, 7], "seedQuestions": [], "followUpAggressiveness": 5,
                  "maxTurns": maxTurns, "maxVisits": maxVisits},
        "knowledge": kb or {"mode": "llm", "strict": True, "sourceName": "", "items": []},
        "skills": {"rolePlayMode": False, "loopUntilSatisfied": True, "contradictionProbing": False},
        "tools": [],
        "turnTaking": {"canOpen": canOpen, "handoffTriggers": trig, "priority": prio},
        "scoring": {"competencies": comps if comps is not None else ["System Design"]},
    }


print("\n=== 1. GET /config/languages ===")
r = client.get("/config/languages")
assert r.status_code == 200, r.text
cfg = r.json()
codes = [l["code"] for l in cfg["languages"]]
assert cfg["default"] == "en-US" and len(codes) == 18
for l in cfg["languages"]:
    assert l["sttVendor"] == "deepgram" and l["ttsVendor"] == "minimax", l
    assert l["voices"], l["code"]
ok(f"{len(codes)} languages returned, every one has a voice pool")

print("\n=== 2. Frontend fallback list matches the backend registry ===")
ts = open(str(PROJECT / "frontend" / "lib" / "languages.ts"), encoding="utf-8").read()
import re
fe_codes = re.findall(r"\{ code: '([a-zA-Z-]+)', label: '([^']+)' \}", ts)
assert [c for c, _ in fe_codes] == codes, f"\nfrontend={[c for c,_ in fe_codes]}\nbackend={codes}"
be_labels = {l["code"]: l["label"] for l in cfg["languages"]}
mismatched = [(c, lbl, be_labels[c]) for c, lbl in fe_codes if be_labels[c] != lbl]
assert not mismatched, mismatched
ok("all 18 codes AND labels identical in lib/languages.ts and voice_profiles.py")

print("\n=== 3. POST /knowledge/parse with a real multipart upload ===")
csv_bytes = open(str(BACKEND / "sample-knowledge-base.csv"), "rb").read()
r = client.post("/knowledge/parse", files={"file": ("sample-knowledge-base.csv", csv_bytes, "text/csv")})
assert r.status_code == 200, r.text
parsed = r.json()
assert parsed["count"] == 5 and parsed["withAnswers"] == 5, parsed
KB_ITEMS = parsed["items"]
assert all(i["id"] and i["question"] for i in KB_ITEMS)
ok(f"uploaded CSV -> {parsed['count']} items, {parsed['withAnswers']} with ideal answers")

r = client.post("/knowledge/parse", files={"file": ("notes.pdf", b"%PDF-1.4", "application/pdf")})
assert r.status_code == 422 and "isn't supported" in r.json()["detail"], r.text
ok("unsupported file type -> 422 with a message a user can act on")

r = client.post("/knowledge/parse-text",
                json={"text": "Q: What is a mutex?\nA: Mutual exclusion lock.", "format": "txt"})
assert r.status_code == 200 and r.json()["count"] == 1
ok("paste endpoint works")

print("\n=== 4. POST /sessions/start rejects a panel with no opener ===")
bad = {"projectName": "Bad", "language": "en-US",
       "agents": [agent("a", "Ada")], "scorer": {"competencies": []}}
r = client.post("/sessions/start", json={"panel": bad, "channel": "c", "remote_uid": "1"})
assert r.status_code == 400 and "canOpen" in r.json()["detail"], r.text
ok("400 with the real reason, not a 500")

print("\n=== 5. Start a knowledge-base session (ja-JP) ===")
kb = {"mode": "knowledge_base", "strict": True, "sourceName": "sample-knowledge-base.csv",
      "items": KB_ITEMS[:3]}
panel = {
    "projectName": "E2E Panel",
    "language": "ja-JP",
    "agents": [
        agent("tech", "Ada", canOpen=True, prio="high", comps=["System Design"], maxTurns=10, kb=kb),
        agent("hm", "Grace", comps=["Communication"], maxTurns=2,
              trig="the candidate gives a technically correct answer without mentioning cost"),
    ],
    "scorer": {"competencies": [
        {"name": "System Design", "weight": 1.0, "threshold": 0.8},
        {"name": "Communication", "weight": 1.0, "threshold": 0.6},
    ]},
}
r = client.post("/sessions/start", json={"panel": panel, "channel": "chan-1", "remote_uid": "1002"})
assert r.status_code == 200, r.text
start = r.json()
sid = start["session_id"]
ACTIVE_ITEMS = [item.model_dump() for item in sessions_route.SESSIONS[sid]["panel"].agents[0].knowledge.items]
assert start["agent_id"] == "tech" and start["language"] == "ja-JP"
assert start["voice_id"] == "Japanese_IntellectualSenior", start["voice_id"]
ok(f"opened with {start['agent_id']}, language {start['language']}, voice {start['voice_id']}")

assert STARTED_WITH["stt"]["params"]["language"] == "ja-JP"
assert STARTED_WITH["stt"]["params"]["model"] == "nova-3"
assert "key" not in STARTED_WITH["stt"]["params"], "STT must stay on the managed keyless path"
assert "key" not in STARTED_WITH["tts"]["params"], "TTS must stay on the managed keyless path"
assert STARTED_WITH["tts"]["params"]["language_boost"] == "Japanese"
ok("STT/TTS built from the language, no vendor API keys anywhere in the config")

sp = STARTED_WITH["system_prompt"]
assert "COORDINATOR-CONTROLLED INTERVIEW" in sp, "control rule missing from the prompt"
assert "Never choose, invent, repeat, skip, or advance" in sp
assert ACTIVE_ITEMS[0]["question"] not in sp, "the voice model must not receive the whole bank"
assert "OUTPUT LANGUAGE" in sp and "\u65e5\u672c\u8a9e" in sp, "language directive missing"
assert sp.rstrip().endswith("brackets."), "the directive must be the LAST thing in the prompt"
ok("voice prompt has one-source-of-truth control rules and no question bank")

assert len(FAKE_SESSION.thoughts) == 1, FAKE_SESSION.thoughts
assert ACTIVE_ITEMS[0]["question"] in FAKE_SESSION.thoughts[0]
ok("opening agent was handed knowledge-base question 1 immediately, not left to improvise")

print("\n=== 6. Turn 1: partial answer is scored proportionally and advances ===")
SCRIPT.append(ScoreResult(competency_scores={"System Design": 0.5}, flags=[],
                          triggered_agent_ids=[], coverage=0.4,
                          missing_points=["custom aliases", "analytics"]))
r = client.post(f"/sessions/{sid}/next", json={"answer_text": "You hash the URL and store it."})
assert r.status_code == 200, r.text
t1 = r.json()
assert t1["action"] == "follow_up" and t1["current_agent_id"] == "tech"
assert t1["coverage"] == 0.4 and t1["missing_points"] == ["custom aliases", "analytics"]
assert t1["questions_asked"] == 2 and t1["questions_total"] == 3
assert t1["question_status"] == "answered" and t1["question_score"] == 0.4
assert t1["current_question"]["id"] == ACTIVE_ITEMS[1]["id"]
assert SCORE_CALLS[-1]["asked_item_id"] == ACTIVE_ITEMS[0]["id"], "scorer must grade against Q1"
assert SCORE_CALLS[-1]["language"] == "ja-JP", "scorer must be told the interview language"
assert ACTIVE_ITEMS[1]["question"] in FAKE_SESSION.thoughts[-1]
ok("graded Q1 at 40%; UI and agent both advanced to Q2")

print("\n=== 7. Correct Q2 -> Q3; explicit don't-know scores zero and hands off ===")
SCRIPT.append(ScoreResult(competency_scores={"System Design": 0.6}, flags=[],
                          triggered_agent_ids=[], coverage=0.9, answer_correct=True))
r = client.post(f"/sessions/{sid}/next", json={"answer_text": "Cache it and shard the store."})
t2 = r.json()
assert t2["action"] == "follow_up" and t2["questions_asked"] == 3
assert t2["question_status"] == "correct"
assert t2["current_question"]["id"] == ACTIVE_ITEMS[2]["id"]
assert ACTIVE_ITEMS[2]["question"] in FAKE_SESSION.thoughts[-1]
ok("accepted Q2 and advanced both channels to Q3")

r = client.post(f"/sessions/{sid}/next", json={"answer_text": "I don't know the answer."})
t3 = r.json()
assert t3["action"] == "switch_agent" and t3["question_status"] == "skipped"
assert t3["current_agent_id"] == "hm" and t3["question_score"] == 0
ok("explicit don't-know scored Q3 at zero and handed off")

assert FAKE_SESSION.stop_count == 1
assert STARTED_WITH["agent_id"] == "hm"
assert STARTED_WITH["voice_id"] == "Japanese_DependableWoman"
assert "You are Grace." in STARTED_WITH["system_prompt"]
assert "ENFORCED SPECIALIST BOUNDARY" in STARTED_WITH["system_prompt"]
ok("handoff replaced the active session with a private context and distinct voice")

asked_qs = ACTIVE_ITEMS
injected = " ".join(FAKE_SESSION.thoughts)
assert all(q["question"] in injected for q in asked_qs)
# Counts bank-question injections, as opposed to the flag-shaped nudges section
# 8 checks. Anchored on the "ORCHESTRATOR TURN" prefix that question_command
# always emits rather than on the delivery wording after it: this assertion
# previously matched "Question:\n", which a prompt-text edit renamed to
# "Question to ask (rephrase naturally):\n", silently taking the count to zero.
# Since this whole file asserts at import, that failure was a collection error
# and everything below it stopped running.
assert len([t for t in FAKE_SESSION.thoughts if "ORCHESTRATOR TURN " in t]) == 3
assert len(set(FAKE_SESSION.thoughts)) == len(FAKE_SESSION.thoughts), "a question was repeated"
ok("all 3 session-randomized bank questions asked exactly once, none repeated")

print("\n=== 8. Non-KB agent falls back to a flag-shaped nudge ===")
before = len(FAKE_SESSION.thoughts)
SCRIPT.append(ScoreResult(competency_scores={"Communication": 0.3}, flags=["vague"],
                          triggered_agent_ids=[]))
r = client.post(f"/sessions/{sid}/next", json={"answer_text": "Um, it depends I guess."})
t5 = r.json()
assert t5["action"] == "follow_up" and t5["current_agent_id"] == "hm"
assert t5["questions_total"] == 0, "agent with no bank should report no progress"
assert "vague" in FAKE_SESSION.thoughts[-1].lower()
assert len(FAKE_SESSION.thoughts) == before + 1
ok("llm-mode agent got the vagueness nudge, not a bank question")

print("\n=== 9. Interview finishes; further turns are safe ===")
SCRIPT.append(ScoreResult(competency_scores={"Communication": 0.9}, flags=[], triggered_agent_ids=[]))
r = client.post(f"/sessions/{sid}/next", json={"answer_text": "Concretely: we cut p99 by 40%."})
t6 = r.json()
assert t6["is_finished"] is True and t6["action"] == "finished", t6
ok("Communication crossed its 0.6 threshold -> agent satisfied -> queue empty -> finished")

r = client.post(f"/sessions/{sid}/next", json={"answer_text": "anything"})
assert r.json()["is_finished"] is True
r = client.post("/sessions/does-not-exist/next", json={"answer_text": "x"})
assert r.status_code == 404
ok("post-finish turns are no-ops; unknown session -> 404")

print("\n=== 10. Transcript kept the grading provenance ===")
state = sessions_route.SESSIONS[sid]["state"]
turns = state.transcript
answers = [t for t in turns if t.speaker == "candidate"]
questions = [t for t in turns if t.speaker == "agent"]

# Provenance lives on the candidate's turns, which is what gets graded.
assert len(answers) == 5, len(answers)
assert answers[0].knowledge_item_id == ACTIVE_ITEMS[0]["id"]
assert answers[0].coverage == 0.4
assert answers[3].knowledge_item_id is None, "the llm-mode agent's turn has no bank item"
assert answers[3].flags == ["vague"]
ok("each answer records which bank question it answered, its coverage and its flags")

# Both halves of the conversation are stored, or the report renders answers with
# no questions above them - which is how the transcript came to be unreadable.
assert questions, "the interviewer's turns are missing from the transcript"
assert [t.speaker for t in turns[:6]] == ["agent", "candidate"] * 3, [t.speaker for t in turns[:6]]
assert questions[0].text == ACTIVE_ITEMS[0]["question"], questions[0].text
assert all(t.coverage is None and not t.flags for t in questions), \
    "interviewer turns must stay inert for grading"
assert [t.turn_number for t in turns] == list(range(1, len(turns) + 1)), "turn numbers must be dense"
ok("the transcript interleaves the question asked with the answer given")

print("\n=== 10b. Injected directives are marked, and the client strips them ===")
from app.orchestrator.agent_launcher import INSTRUCTION_MARKER, inject_followup


class _RecordingSession:
    def __init__(self): self.said = []
    def think(self, text, **kwargs): self.said.append(text)


_rec = _RecordingSession()
inject_followup(_rec, "HOST INTAKE. Ask about their current role.")
assert _rec.said, "inject_followup never called think()"
assert _rec.said[0].startswith(INSTRUCTION_MARKER), _rec.said[0]
assert "HOST INTAKE." in _rec.said[0]
ok("every injected instruction is marked at the single think() call site")

# Agora echoes injections back as USER transcriptions, so the browser cannot
# tell a directive from speech without this marker. If the two spellings drift
# the interview silently starts posting its own prompts back as the candidate's
# answers - with every type check, lint and test still green - so the drift is
# asserted here rather than trusted.
_hook = open(str(PROJECT / "frontend" / "hooks" / "useAgoraVoiceClient.ts"),
             encoding="utf-8").read()
_m = re.search(r'export const INSTRUCTION_MARKER = "([^"]+)"', _hook)
assert _m, "the client no longer exports INSTRUCTION_MARKER"
assert _m.group(1) == INSTRUCTION_MARKER, (_m.group(1), INSTRUCTION_MARKER)
assert _hook.count(".includes(INSTRUCTION_MARKER)") >= 2, \
    "the client exports the marker but no longer filters transcripts with it"
ok("client and server agree on the marker, and the client still filters on it")

# A stale client that does not filter would post the directive back as speech.
# It must not be graded: that is exactly how a real answer came back at 0%.
_leak = client.post(f"/sessions/{sid}/next", json={
    "answer_text": f"{INSTRUCTION_MARKER} HOST INTAKE. Ask about their role. I'm a student",
})
assert _leak.status_code == 422, (_leak.status_code, _leak.text)
_before = len(sessions_route.SESSIONS[sid]["state"].transcript)
assert client.post(f"/sessions/{sid}/next", json={
    "answer_text": f"{INSTRUCTION_MARKER} anything",
}).status_code == 422
assert len(sessions_route.SESSIONS[sid]["state"].transcript) == _before, \
    "a refused answer must not reach the transcript"
ok("a directive posted back as speech is refused, not scored or transcribed")

# Speech-to-text re-emits a turn as it grows and the Agora toolkit updates that
# turn in place, so any buffer that keeps the FIRST sighting of a turn and skips
# the rest freezes an answer at its opening words. That shipped: answers were
# reaching the scorer as "I'm" and "No.". Only a user transcription's `final`
# reports finality - `turn_status`, and therefore the toolkit's `status`, is
# undefined on every candidate line - so `status !== IN_PROGRESS` silently
# called each fragment complete.
_hook_src = open(str(PROJECT / "frontend" / "hooks" / "useAgoraVoiceClient.ts"),
                 encoding="utf-8").read()
assert "final === true" in _hook_src, \
    "the hook no longer reads finality from the user transcription's `final` flag"

for _name in ("app/interview-room/InterviewRoomLive.tsx",
              "components/dsa-interview/DsaInterviewRoom.tsx"):
    _src = open(str(PROJECT / "frontend" / _name), encoding="utf-8").read()
    assert "firstSighting" in _src, f"{_name} no longer distinguishes a turn's first sighting"
    assert ".set(key, " in _src, \
        f"{_name} no longer replaces a turn's text as it grows - answers will truncate again"
ok("candidate turns are replaced as they grow, not frozen at the first fragment")

# Barge-in needs three things that live in three files and are individually
# silent when wrong: the server must allow interruption, the browser must keep
# publishing the microphone while an agent speaks, and the VAD model must be on
# disk to be served. Any one of them reverting leaves an interview that simply
# never lets the candidate cut in, with every other check still green.
_launcher = open(str(BACKEND / "app" / "orchestrator" / "agent_launcher.py"),
                 encoding="utf-8").read()
_interruption = _launcher.split("with_interruption(")[1].split(")")[0]
assert '"enable": True' in _interruption, \
    "agent interruption is disabled again - barge-in cannot fire"
assert '"start_of_speech"' in _interruption, _interruption

_room = open(str(PROJECT / "frontend" / "app" / "interview-room" / "InterviewRoomLive.tsx"),
             encoding="utf-8").read()
assert "useSpeechDetector(" in _room, "the room no longer runs local voice-activity detection"
assert "takeFloorFromAgent" in _room, "the shared floor-transfer path is gone"

_pkg = json.loads(open(str(PROJECT / "frontend" / "package.json"), encoding="utf-8").read())
assert "copy-vad-assets" in _pkg["scripts"].get("prebuild", ""), \
    "prebuild no longer copies the VAD model - it would 404 in production"
ok("barge-in is enabled server-side, wired client-side, and its model ships")

print("\n=== 10d. Feedback quotes the transcript it came from ===")
from app.reports.store import presentation as _presentation
from app.schemas.report import (
    InterviewReport as _Rep, TranscriptEntry as _Turn,
    ReportTotals as _Totals, CompetencyResult as _Comp,
)

_comp = lambda n, s, c: _Comp(name=n, score=s, covered=c, weight=0.5, threshold=0.6)
_report = _Rep(
    session_id="s", candidate_name="Jagrit", candidate_ref="AIP-1", panel_name="SDE Panel",
    language="en-US", started_at="2026-09-05T10:00:00", finished_at="2026-09-05T10:30:00",
    completed=True,
    totals=_Totals(overall_score=0.55, band="Developing", competencies_total=2,
                   competencies_covered=1, coverage_rate=0.5, knowledge_coverage=0.5,
                   questions_answered=2, flags={"vague": 1}),
    competencies=[_comp("Architecture", 0.82, True), _comp("Product sense", 0.31, False)],
    agents=[],
    transcript=[
        _Turn(turn=2, speaker="candidate", agent_id="a", agent_name="Maya",
              text="I would shard by tenant id and put a read-through cache in front.",
              flags=[], coverage=0.9, knowledge_item_id="k1", question_score=0.88),
        _Turn(turn=4, speaker="candidate", agent_id="b", agent_name="Devan",
              text="Um, it depends I guess.",
              flags=["vague"], coverage=0.1, knowledge_item_id="k2", question_score=0.2),
    ],
)
_view = _presentation(_report, "Backend Engineer")
# A score on its own is a grade, not feedback. Each line must point at the turn
# it came from, or a candidate cannot act on it and a recruiter cannot check it.
assert "shard by tenant id" in _view["strengths"][0], _view["strengths"]
assert "turn 2" in _view["strengths"][0]
assert "Um, it depends" in _view["growth"][0], _view["growth"]
assert "vague" in _view["growth"][0] and "turn 4" in _view["growth"][0]
ok("strengths and growth areas quote the answer and name the interviewer")

# Evidence has to belong to the competency it is offered for, and no turn may be
# quoted twice. Both mechanisms are exercised by cases that only one of them can
# satisfy: Maya holds the two best answers in the interview, so
#   - without the owner filter, Ari's competency would quote Maya's third answer,
#     which outscores Ari's;
#   - without the used-turn set, Maya's two competencies would quote turn 2 twice.
from app.schemas.report import AgentReport as _Agent
_agent = lambda aid, name, comps: _Agent(
    agent_id=aid, name=name, role="Technical", visits=1, questions_answered=1,
    satisfaction=0.7, force_closed=False, competencies=comps)
_answer = lambda n, aid, name, text, score, flags: _Turn(
    turn=n, speaker="candidate", agent_id=aid, agent_name=name, text=text,
    flags=flags, coverage=score, knowledge_item_id=f"k{n}", question_score=score)
_multi = _report.model_copy(update={
    "competencies": [_comp("Architecture", 0.95, True),
                     _comp("Scalability", 0.85, True),
                     _comp("Complexity analysis", 0.70, True),
                     _comp("Product sense", 0.20, False)],
    "agents": [_agent("sd", "Maya", ["Architecture", "Scalability"]),
               _agent("dsa", "Ari", ["Complexity analysis"]),
               _agent("pm", "Devan", ["Product sense"])],
    "transcript": [
        _answer(2, "sd", "Maya", "Shard by tenant id with a read-through cache.", 0.95, []),
        _answer(4, "sd", "Maya", "Back-pressure the writers before the queue fills.", 0.85, []),
        # Outranks Ari's answer, so a whole-transcript search would hand it to
        # Ari's competency. Only the owner filter keeps it with Maya.
        _answer(5, "sd", "Maya", "Partition the index by shard key.", 0.80, []),
        _answer(6, "dsa", "Ari", "It is O(n log n) because the sort dominates.", 0.70, []),
        _answer(8, "pm", "Devan", "Um, it depends I guess.", 0.15, ["vague"]),
    ],
})
_mv = _presentation(_multi, "Backend Engineer")
# Maya's two competencies must quote her two different answers, not turn 2 twice.
assert "Shard by tenant" in _mv["strengths"][0], _mv["strengths"]
assert "Back-pressure" in _mv["strengths"][1], _mv["strengths"]
# Ari's competency must quote Ari, not Maya's leftovers.
assert "Ari" in _mv["strengths"][2] and "O(n log n)" in _mv["strengths"][2], _mv["strengths"]
_quoted = re.findall(r"\(turn (\d+)\)", " ".join(_mv["strengths"] + _mv["growth"]))
assert len(set(_quoted)) == len(_quoted), f"a turn was quoted more than once: {_quoted}"
ok("each competency quotes its own interviewer, and no turn is quoted twice")

# The same sentences are produced in the browser for the self-serve path, and a
# report must not read differently depending on which side wrote the row.
_ts = open(str(PROJECT / "frontend" / "lib" / "reports.ts"), encoding="utf-8").read()
assert "function evidenceFor(" in _ts, "the client no longer builds transcript evidence"
for _fragment in ("scored their strongest answer here", "flagged this exchange"):
    assert _fragment in _ts, f"client evidence wording drifted: {_fragment!r}"
ok("client and server produce the same evidence sentences")

print("\n=== 10e. Silence prompts reach the host, not just panel agents ===")
# The host holds the floor during intake and is not one of panel.agents, so a
# lookup there returns None. That refused every prompt during the opening
# exchange - the phase where a candidate is most likely to freeze.
_live = sessions_route.SESSIONS[sid]
_state = _live["state"]
_state.is_finished = False
_state.host_phase = "intake"
_state.floor = "candidate_speaking"
_state.current_agent_id = sessions_route.HOST_AGENT_ID
_live["turn_busy"] = False
_live["agent_uids"].setdefault(sessions_route.HOST_AGENT_ID, "1")
_live["voices"].setdefault(sessions_route.HOST_AGENT_ID, "voice-host")
_live["agora_sessions"].setdefault(sessions_route.HOST_AGENT_ID, FakeAgoraSession())

for _stage in ("nudge", "repeat"):
    _r = client.post(f"/sessions/{sid}/silence-prompt", json={
        "question_revision": _state.question_revision, "stage": _stage,
    })
    assert _r.status_code == 200, (_stage, _r.status_code, _r.text)
    assert _r.json()["current_agent_id"] == sessions_route.HOST_AGENT_ID, _r.json()
    _state.floor = "candidate_speaking"          # the agent spoke; floor returns

# A revision that has moved on must still be refused, so a late timer cannot
# interrupt the next question.
assert client.post(f"/sessions/{sid}/silence-prompt", json={
    "question_revision": _state.question_revision - 1, "stage": "nudge",
}).status_code == 409
# And an unknown speaker must still be refused - the host tolerance must not
# have turned into "accept anything".
_state.current_agent_id = "not-a-real-agent"
assert client.post(f"/sessions/{sid}/silence-prompt", json={
    "question_revision": _state.question_revision, "stage": "nudge",
}).status_code == 409
ok("host intake is prompted; stale revisions and unknown speakers are refused")

print("\n=== 10f. Breaks are bounded, reachable, and actually pause the work ===")
# The room cannot offer a break it does not know it has. This was returned only
# by the break endpoint itself, so the control never appeared and the feature
# was unreachable.
assert sessions_route.StartSessionResponse.model_fields["breaks_remaining"].default \
    == sessions_route.BREAK_MAX_COUNT, "the start response no longer carries the break budget"

_state.current_agent_id = "tech"
_state.is_finished = False
_live["state"].breaks_taken = 0
_live["state"].break_until = None

_taken = []
for _i in range(sessions_route.BREAK_MAX_COUNT):
    # Re-read rather than caching: a refused submit-code rolls the session back
    # to its snapshot, which swaps the state object, so a held reference goes
    # stale and writes to it are silently lost.
    _state = _live["state"]
    # Ending a break hands the floor back to the interviewer, which the client
    # returns via candidate-ready before the candidate can act again.
    _state.floor = "candidate_speaking"
    _r = client.post(f"/sessions/{sid}/break", json={"action": "start"})
    assert _r.status_code == 200, (_i, _r.status_code, _r.text)
    _taken.append(_r.json()["breaks_remaining"])
    # While paused, nothing that costs the candidate time may proceed.
    assert client.post(f"/sessions/{sid}/next", json={"answer_text": "still here"}).status_code == 409
    # Assert the REASON, not just the status. Both of these already refuse with
    # 409 "not a coding question" in this session, so checking the code alone
    # passed happily with the break guard deleted and proved nothing.
    for _endpoint in ("run-code", "submit-code"):
        _blocked = client.post(f"/sessions/{sid}/{_endpoint}", json={
            "code": "print(1)", "language": "python"})
        assert _blocked.status_code == 409, (_endpoint, _blocked.text)
        assert "paused for a break" in _blocked.json()["detail"], (_endpoint, _blocked.text)
    assert client.post(f"/sessions/{sid}/break", json={"action": "end"}).status_code == 200
assert _taken == list(range(sessions_route.BREAK_MAX_COUNT - 1, -1, -1)), _taken

# The cap is the point: an unbounded pause is a way to stop a timed task and go
# and look the answer up.
_state = _live["state"]
_state.floor = "candidate_speaking"
_refused = client.post(f"/sessions/{sid}/break", json={"action": "start"})
assert _refused.status_code == 409, _refused.text
assert "breaks" in _refused.json()["detail"], _refused.text
assert client.post(f"/sessions/{sid}/next", json={"answer_text": "back"}).status_code != 409
ok("break budget is spent down, enforced, and blocks answering and code while paused")

# A break may only be taken when the floor is the candidate's. Starting one
# takes the floor and bumps question_revision, and the closing statement is
# confirmed with the revision the client already held - so a break during the
# sign-off left candidate-ready rejecting every attempt and the interview could
# never finish or produce a report.
_state = _live["state"]
_state.breaks_taken = 0
_state.break_until = None
_state.host_phase = "closing"
_state.current_agent_id = sessions_route.HOST_AGENT_ID
_state.floor = "agent_speaking"
_rev = _state.question_revision
assert client.post(f"/sessions/{sid}/break", json={"action": "start"}).status_code == 409

# Each guard is exercised on its own, because during the sign-off both apply and
# either one alone would hide the loss of the other.
_state = _live["state"]
_state.breaks_taken = 0
_state.floor = "candidate_speaking"          # only host_phase blocks this one
_only_phase = client.post(f"/sessions/{sid}/break", json={"action": "start"})
assert _only_phase.status_code == 409, _only_phase.text
assert "finishing" in _only_phase.json()["detail"], _only_phase.text

_state.host_phase = "interview"
_state.floor = "agent_speaking"              # only the floor blocks this one
_only_floor = client.post(f"/sessions/{sid}/break", json={"action": "start"})
assert _only_floor.status_code == 409, _only_floor.text
assert "finished speaking" in _only_floor.json()["detail"], _only_floor.text

_state.host_phase = "closing"
_state.floor = "agent_speaking"
assert _state.question_revision == _rev, "a refused break must not move the question on"
_done = client.post(f"/sessions/{sid}/candidate-ready", json={"question_revision": _rev})
assert _done.status_code == 200, _done.text
assert _state.is_finished, "the interview must still be able to finish"
ok("a break cannot be taken during the sign-off, so the interview can still finish")

print("\n=== 10g. The room's timing mechanisms are still wired ===")
# These are presence checks, not behaviour tests, and they are here because this
# project has no frontend test runner. They catch a mechanism being deleted;
# they cannot catch it being subtly wrong. Every defect below was found by
# reading and reproduced by hand, and each would pass a type check and a lint
# run unchanged - which is exactly why they are worth pinning.
_room = open(str(PROJECT / "frontend" / "app" / "interview-room" / "InterviewRoomLive.tsx"),
             encoding="utf-8").read()
_dsa = open(str(PROJECT / "frontend" / "components" / "dsa-interview" / "DsaInterviewRoom.tsx"),
            encoding="utf-8").read()

for _label, _src, _needle in [
    # Prompting hands the floor to the agent and back, which re-runs the effect;
    # per-run flags reset and nudged forever without ever re-asking.
    ("silence escalation survives the effect re-run", _room, "silenceStageRef"),
    ("silence escalation stops after two stages", _room, "stage >= 2"),
    # Host intake carries no current_question, so keying on the question id
    # alone silently stopped prompting after the first field.
    ("silence escalation resets when an answer is given", _room,
     "silenceStageRef.current = { questionId: null, stage: 0 }"),
    # applyTurn rebuilds writtenQuestion on every response, so a recomputed
    # deadline handed back the full time - a break reset a coding clock.
    ("task deadline is per task, not per effect run", _room, "taskDeadlineRef.current?.id !== taskId"),
    ("task clock does not run during a break", _room, "breakEndsAtRef.current !== null"),
    # A failed end left the pause in place forever, freezing the task clock and
    # retrying once a second.
    ("automatic break end fires once", _room, "breakEndingRef"),
    ("a passed deadline releases the pause even if ending failed", _room,
     "Date.now() >= breakEndsAtRef.current"),
    # Counting from the phase start interrupted Ari's own greeting.
    ("dsa silence waits for the interviewer to stop", _dsa, "if (isAgentSpeaking) return;"),
    ("dsa silence resets on candidate speech", _dsa, "lastCandidateAtRef"),
    ("dsa silence escalates per phase", _dsa, "silenceStageRef"),
]:
    assert _needle in _src, f"{_label}: {_needle!r} is gone"
ok("all ten room timing mechanisms are present in both interview rooms")

print("\n=== 10h. A rate-limited grader retries instead of losing the answer ===")
# Observed in a real interview: the provider returned 429 with "try again in
# 630ms" and the grader gave up, so that answer scored neutral and carried
# scorer_unavailable for the rest of the interview. A queue is not an outage.
from app.orchestrator import scorer as _scorer


class _Err(Exception):
    pass


_limited_ms = _Err("Error code: 429 - {'code': 'rate_limit_exceeded', "
                   "'message': 'Please try again in 630ms.'}")
_limited_s = _Err("Error code: 429 - rate_limit_exceeded. Please try again in 12.2175s.")
assert 0.6 < _scorer._retry_after_seconds(_limited_ms) < 1.5, \
    _scorer._retry_after_seconds(_limited_ms)
assert _scorer._retry_after_seconds(_limited_s) == _scorer._MAX_SCORER_RETRY_WAIT, \
    "a long back-off must be capped, not waited out on the critical path"
# Everything else fails the same way twice, so retrying only adds latency to an
# interview that is already degrading.
assert _scorer._retry_after_seconds(_Err("Error code: 401 - invalid api key")) is None
assert _scorer._retry_after_seconds(_Err("json_validate_failed")) is None
ok("rate limits are retried and capped; auth and parse failures are not")

print("\n=== 11. A pre-change saved panel still runs ===")
legacy = {
    "projectName": "Old Panel",
    "agents": [{
        "id": "old", "identity": {"name": "Old", "role": "Technical", "color": "#fff", "avatar": ""},
        "voice": {"provider": "elevenlabs", "voiceId": "default", "language": "en-UK",
                  "speakingStyle": "professional"},
        "behavior": {"systemPrompt": "p", "greetingMessage": "g", "fallbackMessage": "f",
                     "scenarioBrief": ""},
        "logic": {"difficultyBand": [3, 7], "seedQuestions": ["Legacy seed question?"],
                  "followUpAggressiveness": 5, "maxTurns": 5, "maxVisits": 3},
        "skills": {"rolePlayMode": False, "loopUntilSatisfied": True, "contradictionProbing": False},
        "tools": [], "turnTaking": {"canOpen": True, "handoffTriggers": "", "priority": "high"},
        "scoring": {"competencies": ["Legacy"]},
    }],
    "scorer": {"competencies": [{"name": "Legacy", "weight": 1, "threshold": 0.7}]},
}
r = client.post("/sessions/start", json={"panel": legacy, "channel": "c2", "remote_uid": "2"})
assert r.status_code == 200, r.text
old = r.json()
assert old["language"] == "en-US", "missing language must default, and the stale en-UK is ignored"
assert old["voice_id"] == "English_Trustworth_Man"
assert "Legacy seed question?" in STARTED_WITH["system_prompt"], "seedQuestions still used in llm mode"
ok("old panel validates, stale voice fields ignored, seedQuestions still honoured")

print("\n=== 12. Unknown language degrades instead of 500-ing ===")
weird = dict(panel, language="tlh-KL", agents=[agent("x", "X", canOpen=True, prio="high")])
r = client.post("/sessions/start", json={"panel": weird, "channel": "c3", "remote_uid": "3"})
assert r.status_code == 200, r.text
# The response reports the RESOLVED language, not the one that was asked for -
# so a client is told what will actually be spoken rather than what it requested.
assert r.json()["language"] == "en-US", r.json()
assert STARTED_WITH["stt"]["params"]["language"] == "en-US", "must fall back to the default profile"
ok("unknown language falls back to English; response reports the resolved language, not the input")

print("\n=== 13. Orchestrator floor, revisions, and idempotency ===")
flow_kb = {"mode": "knowledge_base", "strict": True, "sourceName": "flow-test",
           "bankId": "custom", "items": [{"id": "flow-q", "question": "Explain a cache.",
           "idealAnswer": "Stores reusable results.", "tags": ["Technical"], "kind": "verbal"}]}
flow_panel = {"projectName": "Floor test", "language": "en-US",
              "agents": [agent("floor-agent", "Floor", canOpen=True, maxTurns=1, kb=flow_kb)],
              "scorer": {"competencies": []}}
r = client.post("/sessions/start", json={"panel": flow_panel, "channel": "floor", "remote_uid": "91"})
flow_start = r.json()
flow_sid = flow_start["session_id"]
assert flow_start["awaiting"] == "agent" and flow_start["question_revision"] == 1

r = client.post(f"/sessions/{flow_sid}/next", json={
    "answer_text": "It stores results.", "question_id": "flow-q",
    "question_revision": 1, "answer_id": "answer-one",
})
assert r.status_code == 409 and "yielded the floor" in r.json()["detail"]

r = client.post(f"/sessions/{flow_sid}/candidate-ready", json={"question_revision": 1})
assert r.status_code == 200 and r.json()["awaiting"] == "candidate"
SCRIPT.append(ScoreResult(competency_scores={}, flags=[], triggered_agent_ids=[],
                          coverage=0.8, answer_correct=True))
r = client.post(f"/sessions/{flow_sid}/next", json={
    "answer_text": "It stores reusable results.", "question_id": "flow-q",
    "question_revision": 1, "answer_id": "answer-one",
})
assert r.status_code == 200
first_result = r.json()
turn_count = len(sessions_route.SESSIONS[flow_sid]["state"].transcript)
r = client.post(f"/sessions/{flow_sid}/next", json={
    "answer_text": "duplicate", "question_id": "flow-q",
    "question_revision": 1, "answer_id": "answer-one",
})
assert r.status_code == 200 and r.json() == first_result
assert len(sessions_route.SESSIONS[flow_sid]["state"].transcript) == turn_count
ok("agent must yield before answer; stale/duplicate events cannot advance twice")

print("\n=== 14. Role boundary rejects a technical HR bank ===")
hr_bad = {"projectName": "Bad HR", "language": "en-US",
          "agents": [{**agent("hr", "Rhea", canOpen=True, kb={**flow_kb, "bankId": "dsa"}),
                      "identity": {"name": "Rhea", "role": "Behavioural", "color": "#fff", "avatar": ""}}],
          "scorer": {"competencies": []}}
r = client.post("/sessions/start", json={"panel": hr_bad, "channel": "bad-hr", "remote_uid": "92"})
assert r.status_code == 400 and "cannot use" in r.json()["detail"]
ok("HR cannot be configured with a DSA/system-design bank")

mixed_bank = {"mode": "knowledge_base", "strict": True, "sourceName": "mixed",
              "bankId": "custom", "items": [
                  {"id": "technical-only", "question": "Explain a cache.", "idealAnswer": "Reuse results.",
                   "tags": ["Technical"], "kind": "verbal", "domain": "general"},
                  {"id": "behavioural-only", "question": "Tell me about a conflict.", "idealAnswer": "STAR.",
                   "tags": ["Behavioural"], "kind": "verbal", "domain": "behavioural"},
              ]}
mixed_panel = {"projectName": "Mixed", "language": "en-US",
               "agents": [agent("technical", "Ada", canOpen=True, maxTurns=2, kb=mixed_bank)],
               "scorer": {"competencies": []}}
r = client.post("/sessions/start", json={"panel": mixed_panel, "channel": "mixed", "remote_uid": "93"})
assert r.status_code == 200, r.text
assert r.json()["questions_total"] == 1 and r.json()["current_question"]["id"] == "technical-only"
ok("technical specialist's custom bank excludes behavioural questions")

print("\n=== 15. Route inventory ===")
# Read the OpenAPI schema rather than walking app.routes - include_router wraps
# children in _IncludedRouter on this FastAPI version, and the schema is the
# authoritative list of what is actually served.
schema = client.get("/openapi.json").json()
routes = sorted(f"{m.upper()} {path}" for path, ops in schema["paths"].items() for m in ops)
for r_ in routes:
    print(f"       {r_}")
for expected in ["GET /config/languages", "POST /knowledge/parse", "POST /knowledge/parse-text",
                 "POST /sessions/start", "POST /sessions/{session_id}/next",
                 "GET /token", "POST /agents/start"]:
    assert expected in routes, f"missing {expected}"
ok("every expected route registered, legacy /token and /agents/start still present")

print("\n=== 14. Token endpoint wiring ===")
import app.main as _main
# Regression guard. `from app.routes import ..., invitations, ...` once shadowed
# the invitation-store import in main.py, so _require_caller raised
# AttributeError and every invited candidate got a 500 from /token. The module
# still imported cleanly, which is exactly why nothing caught it - so the check
# is that the names it calls at *runtime* actually resolve.
for _fn in ("load_invitation", "assert_usable"):
    assert hasattr(_main.invitation_store, _fn), f"main.invitation_store is missing {_fn}"
assert _main.invitation_store.__name__ == "app.invitations.store", \
    f"invitation_store points at {_main.invitation_store.__name__}, not the store"
try:
    _main._require_caller(None, None)
    raise AssertionError("_require_caller allowed an anonymous call")
except HTTPException as _exc:
    assert _exc.status_code == 401
ok("/token rejects anonymous callers and resolves the invitation store")

print("\nEND-TO-END: all checks passed.\n")

SCENARIO_COMPLETED = True


def test_end_to_end_scenario_completed():
    """Gives the import-time scenario above a name pytest can count.

    Everything in this file asserts at module scope, so a break surfaces as a
    *collection error* and the module reports "no tests ran" even when it is
    healthy - which is how a stale assertion sat here unnoticed while roughly
    fifty later checks silently stopped running. This turns a green run into
    "1 passed" and a broken one into a named failure.
    """
    assert SCENARIO_COMPLETED
