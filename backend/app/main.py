import os

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.dsa.question_bank import QUESTION_BANK
from app.invitations import store as invitation_store
from app.orchestrator.agent_launcher import start_agent_from_config
from app.token_generator import generate_token
from app.routes import config, dsa_sessions, invitations, job_panels, knowledge, report_queries, sessions

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
app.include_router(invitations.router)   # candidate-facing; see routes/invitations.py
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


def _require_caller(authorization: str | None, invite: str | None) -> None:
    """Prove the caller is either a signed-in user or an invited candidate.

    Both of the endpoints below hand out something that costs money: an Agora
    RTC token, and a running agent. They took no credential at all, so anyone
    who knew the backend URL could mint tokens against this app id.

    Worse than the billing: an RTC token is issued *for a named channel*, and
    channel names were `panel-<epoch millis>`. Anyone who knew roughly when an
    interview ran could enumerate a few minutes of timestamps, mint a token for
    the winning channel, and sit silently in a live interview listening to the
    candidate. Channel names are random now (see the clients), and this check
    means guessing one is no longer enough on its own.

    Invited candidates have no Supabase session by design, so the invitation
    token is accepted as the equivalent proof.
    """
    if invite:
        # Raises if the token is unknown, revoked or expired.
        invitation = invitation_store.load_invitation(invite)
        invitation_store.assert_usable(invitation)
        return
    try:
        if QUESTION_BANK.user_id_from_token(authorization):
            return
    except ValueError:
        pass
    raise HTTPException(
        status_code=401,
        detail="Sign in, or open your interview invitation link, before joining a room.",
    )


@app.post("/agents/start")
def start_agent(
    agent_id: str,
    channel: str,
    remote_uid: str,
    authorization: str | None = Header(default=None),
    invite: str | None = Query(default=None),
):
    _require_caller(authorization, invite)
    agent_instance_id = start_agent_from_config(agent_id, channel, remote_uid)
    return {"agent_id": agent_instance_id}


@app.get("/token")
def get_token(
    channel: str,
    uid: int,
    authorization: str | None = Header(default=None),
    invite: str | None = Query(default=None),
):
    _require_caller(authorization, invite)
    return {"token": generate_token(channel, uid)}
