import json
from pathlib import Path
from agora_agent import Agent as AgoraAgentBuilder, Agora, Area, DeepgramSTT, OpenAI, Groq, MiniMaxTTS
import os
from dotenv import load_dotenv

from app.schemas.panel import Agent as PanelAgent

load_dotenv()

client = Agora(
    area=Area.US,
    app_id=os.environ["AGORA_APP_ID"],
    app_certificate=os.environ["AGORA_APP_CERTIFICATE"],
)

RECIPE_PATH = Path(__file__).resolve().parent.parent.parent / "recipes" / "sde_panel"


# ── LEGACY: still used by the standalone test-voice page. Do not remove yet. ──

def load_agent_config(agent_id: str) -> dict:
    config = json.loads((RECIPE_PATH / "config.json").read_text())
    for agent in config["agents"]:
        if agent["id"] == agent_id:
            return agent
    raise ValueError(f"No agent with id '{agent_id}' in recipe")


def load_seed_questions(agent_id_topic_key: str) -> list[dict]:
    seed_data = json.loads((RECIPE_PATH / "seed_questions.json").read_text())
    return seed_data.get(agent_id_topic_key, [])


def build_system_prompt(agent_config: dict) -> str:
    """LEGACY - works against the old snake_case config.json shape only."""
    parts = [agent_config["behavior"]["system_prompt"]]

    logic = agent_config["interview_logic"]
    if logic.get("difficulty_min") not in (None, "n/a"):
        parts.append(
            f"Keep question difficulty between {logic['difficulty_min']} and {logic['difficulty_max']}."
        )
    if logic.get("follow_up_aggressiveness"):
        parts.append(f"Follow-up style: {logic['follow_up_aggressiveness']}.")

    skills = agent_config["skills"]
    if skills.get("loop_until_satisfied"):
        parts.append("Do not move to a new topic until the candidate's answer is satisfactory.")
    if skills.get("contradiction_probing"):
        parts.append("If the candidate contradicts something they said earlier, point it out and ask them to clarify.")
    if skills.get("role_play_mode"):
        parts.append("Stay in character for any role-play scenario given to you.")

    ref = logic.get("seed_questions_ref")
    if ref:
        topic_key = ref.split("#")[-1]
        questions = load_seed_questions(topic_key)
        if questions:
            question_list = "\n".join(f"- {q['prompt']}" for q in questions)
            parts.append(f"Draw from this question set as needed:\n{question_list}")

    return "\n\n".join(parts)


def start_agent_from_config(agent_id: str, channel: str, remote_uid: str) -> str:
    """LEGACY - reads from the hardcoded sde_panel recipe file. Used by test-voice only."""
    agent_config = load_agent_config(agent_id)
    system_prompt = build_system_prompt(agent_config)
    voice = agent_config["voice"]

    agent = (
        AgoraAgentBuilder(client)
        .with_stt(DeepgramSTT(model="nova-3", language=voice["language"]))
        .with_llm(OpenAI(
            model="gpt-4o-mini",
            system_messages=[{"role": "system", "content": system_prompt}],
            greeting_message=agent_config["behavior"]["greeting_message"],
            failure_message=agent_config["behavior"]["failure_message"],
            max_history=10,
        ))
        .with_tts(MiniMaxTTS(model="speech-2.6-turbo", voice_id=voice["voice_id"]))
    )

    session = agent.create_session(
        channel=channel,
        agent_uid="0",
        remote_uids=[remote_uid],
        name=f"{agent_id}-{channel}",
        idle_timeout=120,
    )

    return session.start()


# ── NEW: works against the real Agent pydantic model (panel.py), used by the ──
# ── orchestrator for real sessions built from the frontend builder. ──

def build_system_prompt_from_agent(agent: PanelAgent) -> str:
    """Same composition logic as build_system_prompt, but against the real
    camelCase Agent schema instead of the old recipe dict shape."""
    parts = [agent.behavior.systemPrompt]

    diff_min, diff_max = agent.logic.difficultyBand
    parts.append(f"Keep question difficulty between {diff_min} and {diff_max} (on a 1-10 scale).")

    if agent.logic.followUpAggressiveness:
        parts.append(f"Follow-up aggressiveness (1-10 scale): {agent.logic.followUpAggressiveness}.")

    if agent.skills.loopUntilSatisfied:
        parts.append("Do not move to a new topic until the candidate's answer is satisfactory.")
    if agent.skills.contradictionProbing:
        parts.append("If the candidate contradicts something they said earlier, point it out and ask them to clarify.")
    if agent.skills.rolePlayMode and agent.behavior.scenarioBrief:
        parts.append(f"Stay in character for this scenario: {agent.behavior.scenarioBrief}")

    if agent.logic.seedQuestions:
        question_list = "\n".join(f"- {q}" for q in agent.logic.seedQuestions)
        parts.append(f"Draw from this question set as needed:\n{question_list}")

    return "\n\n".join(parts)


def start_session_agent(agent: PanelAgent, channel: str, remote_uid: str):
    """Starts the ONE live Agora agent instance for a real session, using the
    opening agent's persona. Returns (agent_id, session) - session is kept so
    swap_agent_persona() can update it later without a new Join call."""
    system_prompt = build_system_prompt_from_agent(agent)

    agent_builder = (
        AgoraAgentBuilder(client)
        .with_stt(DeepgramSTT(model="nova-3", language=agent.voice.language))
        .with_llm(Groq(
            api_key=os.environ["GROQ_API_KEY"],
            base_url="https://api.groq.com/openai/v1/chat/completions",
            model="openai/gpt-oss-20b",
            system_messages=[{"role": "system", "content": system_prompt}],
            greeting_message=agent.behavior.greetingMessage,
            failure_message=agent.behavior.fallbackMessage,
            max_history=10,
        ))
        .with_tts(MiniMaxTTS(model="speech-2.6-turbo", voice_id="English_captivating_female1"))
    )

    session = agent_builder.create_session(
        channel=channel,
        agent_uid="0",
        remote_uids=[remote_uid],
        name=f"{agent.id}-{channel}",
        idle_timeout=180,
    )

    agent_instance_id = session.start()
    return agent_instance_id, session


def swap_agent_persona(session, new_agent: PanelAgent) -> None:
    """Hot-swaps the persona on an ALREADY RUNNING session - no new Join call,
    same live Agora instance, per the single-agent-persona-swap decision.

    CONFIRMED against the official Python SDK reference: AgentSession.update()
    is real - "Updates the agent configuration mid-session without restarting.
    Accepts a partial properties object in REST API format." The nested shape
    below matches the Join request body's llm/tts structure, which is the most
    likely correct format for the "REST API format" the docs describe - worth
    a live test to confirm the exact accepted keys before relying on this in
    a real session, same as everything else we've verified by testing rather
    than assuming.
    """
    new_system_prompt = build_system_prompt_from_agent(new_agent)

    session.update(
        llm={
            "system_messages": [{"role": "system", "content": new_system_prompt}],
            "greeting_message": new_agent.behavior.greetingMessage,
            "failure_message": new_agent.behavior.fallbackMessage,
        },
        tts={
            "voice_id": new_agent.voice.voiceId,
        },
    )


def inject_followup(session, instruction_text: str) -> None:
    """Injects a follow-up instruction into the CURRENTLY loaded persona,
    without switching agents or touching the system prompt/voice.

    CONFIRMED against the official Python SDK reference: AgentSession.think()
    is real - "Injects a custom text instruction into the running agent."
    This is the FOLLOW_UP action from orchestrator.py - lighter than
    swap_agent_persona(), no config change, just nudges the current turn.
    """
    session.think(instruction_text)