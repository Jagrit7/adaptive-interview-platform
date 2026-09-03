"""Run from backend: python -m tests.test_job_panels"""

import os

os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SECRET_KEY"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""

from fastapi.testclient import TestClient

from app.main import app
import app.routes.job_panels as routes


class FakeAgoraSession:
    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.thoughts: list[str] = []
        self.stopped = False

    def think(self, text, **_options):
        self.thoughts.append(text)

    def stop(self):
        self.stopped = True


launches: list[dict] = []


def fake_start_session_agent(agent, channel, remote_uid, **kwargs):
    session = FakeAgoraSession(agent.id)
    launches.append({
        "agent": agent,
        "channel": channel,
        "remote_uid": remote_uid,
        "kwargs": kwargs,
        "session": session,
    })
    return f"agora-{agent.id}", session


routes.start_session_agent = fake_start_session_agent
routes.JOB_PANEL_SESSIONS.clear()
client = TestClient(app)


catalog = client.get("/job-panels")
assert catalog.status_code == 200, catalog.text
assert [item["slug"] for item in catalog.json()] == ["sde"]
assert catalog.json()[0]["stageCount"] == 3
assert catalog.json()[0]["totalDurationMinutes"] == 75

detail = client.get("/job-panels/sde")
assert detail.status_code == 200, detail.text
assert [stage["agentId"] for stage in detail.json()["stages"]] == [
    "sde-dsa", "sde-system-design", "sde-hr",
]

started = client.post("/job-panels/sde/sessions/start", json={
    "channel": "sde-panel-test",
    "remote_uid": "100222",
    "candidate_name": "Sam",
    "difficulty_min": 2,
    "difficulty_max": 4,
})
assert started.status_code == 200, started.text
body = started.json()
session_id = body["session_id"]
assert body["phase"] == "introduction"
assert body["active_agent_id"] == "sde-dsa"
assert body["transcript_relay_required"] is True
assert {item["agent_uid"] for item in body["participants"]} == {"11", "12", "13"}
assert sum(item["active"] for item in body["participants"]) == 1

assert len(launches) == 3
assert {item["channel"] for item in launches} == {"sde-panel-test"}
assert {item["kwargs"]["agent_uid"] for item in launches} == {"11", "12", "13"}
assert all(item["kwargs"]["remote_uids"] == [routes.PANEL_RELAY_UID] for item in launches)
assert sum(item["kwargs"]["speak_greeting"] for item in launches) == 1

intro_one = client.post(
    f"/job-panels/sessions/{session_id}/utterances", json={"text": "My name is Sam."},
)
assert intro_one.status_code == 200 and intro_one.json()["phase"] == "introduction"
intro_two = client.post(
    f"/job-panels/sessions/{session_id}/utterances",
    json={"text": "I am preparing for backend SDE roles."},
)
assert intro_two.status_code == 200 and intro_two.json()["phase"] == "dsa_ready"

coding = client.post(f"/job-panels/sessions/{session_id}/begin-coding")
assert coding.status_code == 200, coding.text
assert coding.json()["phase"] == "coding"
assert coding.json()["selection"]["mode"] == "blueprint"
assert coding.json()["selection"]["blueprint_slug"] == "sde-core"
assert len(coding.json()["question"]["test_cases"]) >= 5

question = routes.JOB_PANEL_SESSIONS[session_id]["question"]
starter = question["starter_code"]
run = client.post(
    f"/job-panels/sessions/{session_id}/run-code",
    json={"code": starter, "language": "python"},
)
assert run.status_code == 200, run.text
assert run.json()["total"] >= 5

submitted = client.post(
    f"/job-panels/sessions/{session_id}/submit-code",
    json={"code": starter, "language": "python", "trigger": "submitted"},
)
assert submitted.status_code == 200, submitted.text
assert submitted.json()["phase"] == "dsa_follow_up"
assert submitted.json()["active_agent_id"] == "sde-dsa"

dsa_answer = client.post(
    f"/job-panels/sessions/{session_id}/utterances",
    json={"text": "My approach is linear time and constant extra space."},
)
assert dsa_answer.json()["phase"] == "handoff_pending"

system_round = client.post(f"/job-panels/sessions/{session_id}/advance")
assert system_round.status_code == 200
assert system_round.json()["phase"] == "system_design"
assert system_round.json()["active_agent_id"] == "sde-system-design"
for index in range(3):
    response = client.post(
        f"/job-panels/sessions/{session_id}/utterances",
        json={"text": f"System design answer {index + 1}"},
    )
assert response.json()["phase"] == "handoff_pending"

hr_round = client.post(f"/job-panels/sessions/{session_id}/advance")
assert hr_round.status_code == 200
assert hr_round.json()["phase"] == "hr"
assert hr_round.json()["active_agent_id"] == "sde-hr"
for index in range(3):
    response = client.post(
        f"/job-panels/sessions/{session_id}/utterances",
        json={"text": f"Behavioural answer {index + 1}"},
    )
assert response.json()["phase"] == "completed"
assert response.json()["active_agent_id"] is None

ended = client.post(f"/job-panels/sessions/{session_id}/end")
assert ended.status_code == 200 and ended.json()["phase"] == "ended"
assert all(item["session"].stopped for item in launches)

# A failed third join must not leave the first two interviewers consuming quota
# in an orphaned call.
partial_sessions: list[FakeAgoraSession] = []


def partially_failing_start(agent, *_args, **_kwargs):
    if agent.id == "sde-hr":
        raise RuntimeError("simulated HR join failure")
    session = FakeAgoraSession(agent.id)
    partial_sessions.append(session)
    return f"partial-{agent.id}", session


routes.start_session_agent = partially_failing_start
failed = client.post("/job-panels/sde/sessions/start", json={
    "channel": "partial-panel", "remote_uid": "100333",
})
assert failed.status_code == 502, failed.text
assert len(partial_sessions) == 2
assert all(session.stopped for session in partial_sessions)

print(
    "By-job SDE panel: catalog -> 3 concurrent RTC participants -> random written DSA "
    "-> DSA verbal -> system design -> HR -> cleanup"
)
