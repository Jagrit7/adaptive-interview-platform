import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.orchestrator.agent_launcher import start_agent_from_config
from app.token_generator import generate_token
from app.routes import config, dsa_sessions, job_panels, knowledge, published_panels, report_queries, sessions

app = FastAPI(title="Adaptive Interview Platform")

# Origins come from the environment so the same image runs locally and deployed.
# A hardcoded http://localhost:3000 works until the first time this runs anywhere
# else, then fails as a CORS error in the browser with nothing in the server log.
_origins = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(dsa_sessions.router)
app.include_router(job_panels.router)
app.include_router(report_queries.router)
app.include_router(published_panels.router)
app.include_router(config.router)      # GET /config/languages
app.include_router(knowledge.router)   # POST /knowledge/parse, /knowledge/parse-text


@app.get("/health")
def health():
    """Liveness probe for the container HEALTHCHECK and any load balancer.

    Deliberately does no work: it must not call Agora or Groq. A health check
    that depends on a third party reports *their* outage as this service being
    down, and orchestrators respond by restart-looping a process that is fine.
    """
    return {"status": "ok"}


@app.post("/agents/start")
def start_agent(agent_id: str, channel: str, remote_uid: str):
    agent_instance_id = start_agent_from_config(agent_id, channel, remote_uid)
    return {"agent_id": agent_instance_id}


@app.get("/token")
def get_token(channel: str, uid: int):
    return {"token": generate_token(channel, uid)}
