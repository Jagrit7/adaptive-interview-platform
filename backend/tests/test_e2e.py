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

    def think(self, text, *, on_listening_action=None, on_speaking_action=None,
              on_thinking_action=None, interruptable=None, metadata=None, options=None):
        # Mirrors the real keyword-only signature. Both assertions matter: API
        # v2.7 defaults on_listening_action to "interrupt", which would cut the
        # candidate off every time a question is injected.
        assert on_listening_action == "inject", (
            f"think() must not interrupt the candidate, got {on_listening_action!r}")
        assert on_speaking_action == "append", (
            f"think() must let the agent finish speaking, got {on_speaking_action!r}")
        self.thoughts.append(text)

    def update(self, properties):
        # Mirrors the real signature: ONE positional arg. If the code ever
        # regresses to update(llm=..., tts=...) this raises, like the SDK does.
        assert isinstance(properties, dict), "update() must receive a dict"
        self.updates.append(properties)


FAKE_SESSION = FakeAgoraSession()
STARTED_WITH = {}


def fake_start_session_agent(agent, channel, remote_uid, language=None, voice_id=None):
    # Exercise the real registry so a bad voice/language would still blow up here.
    stt = launcher.build_stt(language).to_config()
    tts = launcher.build_tts(language, voice_id).to_config()
    STARTED_WITH.update({
        "agent_id": agent.id, "language": language, "voice_id": voice_id,
        "stt": stt, "tts": tts,
        "system_prompt": launcher.build_system_prompt_from_agent(agent, language),
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
ts = open(str(PROJECT / "frontend" / "lib" / "languages.ts")).read()
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
assert "ONLY questions from the list" in sp, "strict rule missing from the prompt"
assert "Never read out, quote, or hint at the expected answers" in sp
assert KB_ITEMS[0]["question"] in sp
assert "OUTPUT LANGUAGE" in sp and "\u65e5\u672c\u8a9e" in sp, "language directive missing"
assert sp.rstrip().endswith("brackets."), "the directive must be the LAST thing in the prompt"
ok("prompt carries the bank, strict rule, leak guard AND a Japanese language directive last")

assert len(FAKE_SESSION.thoughts) == 1, FAKE_SESSION.thoughts
assert KB_ITEMS[0]["question"] in FAKE_SESSION.thoughts[0]
ok("opening agent was handed knowledge-base question 1 immediately, not left to improvise")

print("\n=== 6. Turn 1: partial answer -> follow-up with the NEXT bank question ===")
SCRIPT.append(ScoreResult(competency_scores={"System Design": 0.5}, flags=[],
                          triggered_agent_ids=[], coverage=0.4,
                          missing_points=["custom aliases", "analytics"]))
r = client.post(f"/sessions/{sid}/next", json={"answer_text": "You hash the URL and store it."})
assert r.status_code == 200, r.text
t1 = r.json()
assert t1["action"] == "follow_up" and t1["current_agent_id"] == "tech"
assert t1["coverage"] == 0.4 and t1["missing_points"] == ["custom aliases", "analytics"]
assert t1["questions_asked"] == 2 and t1["questions_total"] == 3
assert SCORE_CALLS[-1]["asked_item_id"] == KB_ITEMS[0]["id"], "scorer must grade against Q1"
assert SCORE_CALLS[-1]["language"] == "ja-JP", "scorer must be told the interview language"
assert KB_ITEMS[1]["question"] in FAKE_SESSION.thoughts[-1]
assert "\u65e5\u672c\u8a9e" in FAKE_SESSION.thoughts[-1], "injection must name the target language"
ok("graded against Q1's answer; Q2 injected with a Japanese-language instruction; 2/3")

print("\n=== 7. Turn 2 -> Q3, Turn 3 -> bank exhausted, visit ends, handoff ===")
SCRIPT.append(ScoreResult(competency_scores={"System Design": 0.6}, flags=[], triggered_agent_ids=[]))
r = client.post(f"/sessions/{sid}/next", json={"answer_text": "Cache it and shard the store."})
t2 = r.json()
assert t2["action"] == "follow_up" and t2["questions_asked"] == 3
assert KB_ITEMS[2]["question"] in FAKE_SESSION.thoughts[-1]
ok("Q3 injected; still the same agent")

SCRIPT.append(ScoreResult(competency_scores={"System Design": 0.7}, flags=[], triggered_agent_ids=[]))
r = client.post(f"/sessions/{sid}/next", json={"answer_text": "Threads share memory, processes don't."})
t3 = r.json()
assert t3["action"] == "switch_agent", t3
assert t3["current_agent_id"] == "hm", t3
ok("bank spent -> visit ended and handed off to the next agent, not left improvising")

assert len(FAKE_SESSION.updates) == 1, FAKE_SESSION.updates
upd = FAKE_SESSION.updates[0]
assert set(upd.keys()) <= {"llm", "tts"}, upd.keys()
assert "You are Grace." in upd["llm"]["system_messages"][0]["content"]
assert upd["tts"]["voice_setting"]["voice_id"] == "Japanese_DependableWoman", upd["tts"]
ok("persona swap sent as ONE positional dict; new prompt + that agent's voice")

asked_qs = [q for q in KB_ITEMS[:3]]
injected = " ".join(FAKE_SESSION.thoughts)
assert all(q["question"] in injected for q in asked_qs)
assert len([t for t in FAKE_SESSION.thoughts if "Ask the candidate this next question" in t]) == 3
assert len(set(FAKE_SESSION.thoughts)) == len(FAKE_SESSION.thoughts), "a question was repeated"
ok("all 3 bank questions asked exactly once, in upload order, none repeated")

print("\n=== 8. Non-KB agent falls back to a flag-shaped nudge ===")
before = len(FAKE_SESSION.thoughts)
SCRIPT.append(ScoreResult(competency_scores={"Communication": 0.3}, flags=["vague"],
                          triggered_agent_ids=[]))
r = client.post(f"/sessions/{sid}/next", json={"answer_text": "Um, it depends I guess."})
t4 = r.json()
assert t4["action"] == "follow_up" and t4["current_agent_id"] == "hm"
assert t4["questions_total"] == 0, "agent with no bank should report no progress"
assert "vague" in FAKE_SESSION.thoughts[-1].lower()
assert len(FAKE_SESSION.thoughts) == before + 1
ok("llm-mode agent got the vagueness nudge, not a bank question")

print("\n=== 9. Interview finishes; further turns are safe ===")
SCRIPT.append(ScoreResult(competency_scores={"Communication": 0.9}, flags=[], triggered_agent_ids=[]))
r = client.post(f"/sessions/{sid}/next", json={"answer_text": "Concretely: we cut p99 by 40%."})
t5 = r.json()
assert t5["is_finished"] is True and t5["action"] == "finished", t5
ok("Communication crossed its 0.6 threshold -> agent satisfied -> queue empty -> finished")

r = client.post(f"/sessions/{sid}/next", json={"answer_text": "anything"})
assert r.json()["is_finished"] is True
r = client.post("/sessions/does-not-exist/next", json={"answer_text": "x"})
assert r.status_code == 404
ok("post-finish turns are no-ops; unknown session -> 404")

print("\n=== 10. Transcript kept the grading provenance ===")
state = sessions_route.SESSIONS[sid]["state"]
turns = state.transcript
assert len(turns) == 5, len(turns)
assert turns[0].knowledge_item_id == KB_ITEMS[0]["id"]
assert turns[0].coverage == 0.4
assert turns[3].knowledge_item_id is None, "the llm-mode agent's turn has no bank item"
assert turns[3].flags == ["vague"]
ok("each turn records which bank question it answered, its coverage and its flags")

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

print("\n=== 13. Route inventory ===")
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

print("\nEND-TO-END: all checks passed.\n")
