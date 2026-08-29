from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.orchestrator.agent_launcher import start_agent_from_config
from app.token_generator import generate_token
from app.routes import sessions

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)

@app.post("/agents/start")
def start_agent(agent_id: str, channel: str, remote_uid: str):
    agent_instance_id = start_agent_from_config(agent_id, channel, remote_uid)
    return {"agent_id": agent_instance_id}

@app.get("/token")
def get_token(channel: str, uid: int):
    return {"token": generate_token(channel, uid)}
