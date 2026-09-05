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
assert catalog.json()[0]["stageCount"] == 4
assert catalog.json()[0]["totalDurationMinutes"] == 90

detail = client.get("/job-panels/sde")
assert detail.status_code == 200, detail.text
assert [stage["agentId"] for stage in detail.json()["stages"]] == [
    # The product round exists so a technically correct answer can still be
    # challenged on who it is for - the brief's example scenario.
    "sde-dsa", "sde-system-design", "sde-product", "sde-hr",
]

# The purpose-built job-panel session runtime is gone; these panels run on the
# enterprise orchestrator, which test_e2e covers. Asserting its absence keeps
# a second, diverging interview implementation from quietly coming back.
assert not any("/job-panels" in path and "/sessions" in path
               for path in app.openapi()["paths"]), \
    "the duplicate job-panel session runtime is back"
print("  PASS  job panel catalogue serves presets; no second interview runtime exists")
