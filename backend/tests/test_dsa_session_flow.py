"""Run from backend: python -m tests.test_dsa_session_flow"""

import os

# This flow test is intentionally local and must not depend on or mutate the
# configured hosted Supabase project.
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SECRET_KEY"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""

from fastapi.testclient import TestClient

from app.main import app
import app.routes.dsa_sessions as dsa_routes
from app.dsa.evaluator import VerbalEvaluation


class FakeAgoraSession:
    def __init__(self):
        self.thoughts: list[dict] = []
        self.stopped = False

    def think(self, text, **options):
        self.thoughts.append({"text": text, "options": options})

    def stop(self):
        self.stopped = True


fake_sessions: list[FakeAgoraSession] = []


def fake_start_session_agent(*_args, **_kwargs):
    session = FakeAgoraSession()
    fake_sessions.append(session)
    return f"agora-{len(fake_sessions)}", session


async def fake_evaluate_verbal_answer(*_args, **_kwargs):
    return VerbalEvaluation(
        complexity_score=0.9,
        clarity_score=0.8,
        feedback="Correct O(n) time and O(n) space explanation.",
        strengths=["Explained the hash-map lookup clearly."],
        improvements=["Mention duplicate-pair handling explicitly."],
    )


dsa_routes.start_session_agent = fake_start_session_agent
dsa_routes.evaluate_verbal_answer = fake_evaluate_verbal_answer
dsa_routes.DSA_SESSIONS.clear()
client = TestClient(app)


start = client.post("/dsa/sessions/start", json={
    "channel": "dsa-test", "remote_uid": "1002", "mode": "topic_exact",
    "topic_slug": "binary-search", "difficulty_min": 2, "difficulty_max": 2,
})
assert start.status_code == 200, start.text
session_id = start.json()["session_id"]
assert start.json()["phase"] == "introduction"
assert start.json()["agent_uid"] == "1"

coding = client.post(f"/dsa/sessions/{session_id}/begin-coding")
assert coding.status_code == 200, coding.text
assert coding.json()["phase"] == "coding"
assert coding.json()["question"]["slug"] == "first-position"
assert coding.json()["question"]["duration_seconds"] == 1200
assert len(coding.json()["question"]["test_cases"]) == 5
assert "question is now on screen" in fake_sessions[0].thoughts[-1]["text"]

working_code = """def first_position(nums, target):
    left, right = 0, len(nums)
    while left < right:
        middle = (left + right) // 2
        if nums[middle] < target:
            left = middle + 1
        else:
            right = middle
    return left if left < len(nums) and nums[left] == target else -1
"""

run = client.post(
    f"/dsa/sessions/{session_id}/run",
    json={"code": working_code, "language": "python"},
)
assert run.status_code == 200, run.text
assert run.json()["passed"] == 5
assert run.json()["total"] == 5

submitted = client.post(
    f"/dsa/sessions/{session_id}/submit",
    json={"code": working_code, "language": "python", "trigger": "submitted"},
)
assert submitted.status_code == 200, submitted.text
assert submitted.json()["phase"] == "follow_up"
assert submitted.json()["test_run"]["passed"] == 8
assert submitted.json()["test_run"]["total"] == 8
assert all(item["input"] == "Hidden" for item in submitted.json()["test_run"]["results"][-3:])
assert "time and space complexity" in submitted.json()["follow_up"]
assert "middle" in dsa_routes.DSA_SESSIONS[session_id]["code"]

control_text = (
    "The coding period is over. Ask exactly this one verbal follow-up. "
    "Listen to the candidate's complete answer."
)
premature = client.post(
    f"/dsa/sessions/{session_id}/finish",
    json={"verbal_answer": control_text, "transcript": []},
)
assert premature.status_code == 422, premature.text
assert dsa_routes.DSA_SESSIONS[session_id]["phase"] == "follow_up"

finished = client.post(
    f"/dsa/sessions/{session_id}/finish",
    json={
        "candidate_name": "Sam",
        "verbal_answer": "Binary search gives O(log n) time and O(1) extra space.",
        "transcript": [
            {"who": "agent", "text": "What should I call you?"},
            {"who": "candidate", "text": "Sam"},
            {"who": "candidate", "text": "Binary search gives O(log n) time and O(1) extra space."},
        ],
    },
)
assert finished.status_code == 200, finished.text
assert finished.json()["phase"] == "finished"
assert finished.json()["report"]["candidate_name"] == "Sam"
assert finished.json()["report"]["test_run"]["passed"] == 8
assert finished.json()["report"]["overall_score"] > 0.8

report = client.get(f"/dsa/sessions/{session_id}/report")
assert report.status_code == 200, report.text
assert report.json()["feedback"].startswith("Correct")

# A separate exit path proves provider cleanup calls the SDK's native stop().
start_two = client.post("/dsa/sessions/start", json={"channel": "dsa-exit", "remote_uid": "1003"})
session_two = start_two.json()["session_id"]
ended = client.post(f"/dsa/sessions/{session_two}/end")
assert ended.status_code == 200, ended.text
assert fake_sessions[1].stopped is True

print("DSA session flow: start -> coding -> submit -> follow-up -> finish; end -> Agora stop")
