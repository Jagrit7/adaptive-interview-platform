import json
from pathlib import Path
from agora_agent import Agent, Agora, Area, DeepgramSTT, OpenAI, MiniMaxTTS
import os
from dotenv import load_dotenv

load_dotenv()

client = Agora(
    area=Area.US,
    app_id=os.environ["AGORA_APP_ID"],
    app_certificate=os.environ["AGORA_APP_CERTIFICATE"],
)

RECIPE_PATH = Path(__file__).resolve().parent.parent.parent / "recipes" / "sde_panel"


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
    """Composes the base prompt with everything from interview_logic and skills
    that has no direct Agora field, per the split we just defined."""
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

    # seed questions, if this agent references any
    ref = logic.get("seed_questions_ref")
    if ref:
        topic_key = ref.split("#")[-1]  # "seed_questions.json#dsa" -> "dsa"
        questions = load_seed_questions(topic_key)
        if questions:
            question_list = "\n".join(f"- {q['prompt']}" for q in questions)
            parts.append(f"Draw from this question set as needed:\n{question_list}")

    return "\n\n".join(parts)


def start_agent_from_config(agent_id: str, channel: str, remote_uid: str) -> str:
    agent_config = load_agent_config(agent_id)
    system_prompt = build_system_prompt(agent_config)
    voice = agent_config["voice"]

    agent = (
        Agent(client)
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