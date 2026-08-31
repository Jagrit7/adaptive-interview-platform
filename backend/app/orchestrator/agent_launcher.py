import json
import os
from pathlib import Path

from agora_agent import Agent as AgoraAgentBuilder, Agora, Area, DeepgramSTT, OpenAI, Groq, MiniMaxTTS
from dotenv import load_dotenv

from app.config.voice_profiles import (
    assign_voices,
    build_stt,
    build_tts,
    default_greeting,
    get_profile,
    language_directive,
)
from app.knowledge.store import format_knowledge_block
from app.schemas.panel import Agent as PanelAgent, Panel

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

def build_system_prompt_from_agent(agent: PanelAgent, language: str | None = None) -> str:
    """Composes one agent's system prompt from its builder config.

    Order matters: role and persona first, then constraints, then the question
    bank last so the bank is the freshest thing in the model's context when it
    picks a question.
    """
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

    if agent.knowledge.is_active():
        # Knowledge base mode: the uploaded bank replaces free-form question
        # generation entirely, so seedQuestions is intentionally not also
        # appended - two competing question sources produced incoherent
        # interviews in testing.
        parts.append(format_knowledge_block(agent.knowledge, language=language))
    elif agent.logic.seedQuestions:
        question_list = "\n".join(f"- {q}" for q in agent.logic.seedQuestions)
        parts.append(f"Draw from this question set as needed:\n{question_list}")

    # LAST, always. Everything above it may be long stretches of English - the
    # persona, the constraints, the question bank - and an instruction placed
    # before all that gets diluted. This line is what actually makes a Hindi
    # panel speak Hindi.
    parts.append(language_directive(language))

    return "\n\n".join(p for p in parts if p)


def resolve_greeting(agent: PanelAgent, language: str | None) -> str:
    """The agent's greeting, falling back to one written in the target language.

    The greeting is handed to TTS verbatim - the LLM never sees it and so cannot
    translate it. An English greeting on a Hindi panel is therefore spoken in
    English no matter what the language setting says, which is half of why the
    first Hindi test came out in English.

    A greeting the user actually wrote is always respected; only a blank one is
    replaced. The builder warns separately when a greeting's script doesn't match
    the chosen language, because silently overwriting someone's words would be
    worse than letting them hear the mismatch and fix it.
    """
    written = (agent.behavior.greetingMessage or "").strip()
    return written or default_greeting(language)


def resolve_panel_voices(panel: Panel) -> dict[str, str]:
    """agent_id -> MiniMax voice_id, decided once per panel."""
    return assign_voices([a.id for a in panel.agents], panel.language)


def start_session_agent(
    agent: PanelAgent,
    channel: str,
    remote_uid: str,
    language: str | None = None,
    voice_id: str | None = None,
):
    """Starts the ONE live Agora agent instance for a real session, using the
    opening agent's persona. Returns (agora_agent_id, session) - the session is
    kept so swap_agent_persona() can update it later without a new Join call.

    STT/TTS vendor, model and voice all come from voice_profiles.py, keyed on the
    panel language. Nothing here reads the old agent.voice.provider/voiceId
    fields; a user picks a language and that is the whole speech decision.
    """
    profile = get_profile(language)
    system_prompt = build_system_prompt_from_agent(agent, profile.code)

    agent_builder = (
        AgoraAgentBuilder(client)
        .with_stt(build_stt(profile.code))
        .with_llm(Groq(
            api_key=os.environ["GROQ_API_KEY"],
            base_url="https://api.groq.com/openai/v1/chat/completions",
            model="openai/gpt-oss-20b",
            system_messages=[{"role": "system", "content": system_prompt}],
            greeting_message=resolve_greeting(agent, profile.code),
            failure_message=agent.behavior.fallbackMessage,
            # Rolling window of the LAST 10 messages held by the Agora agent.
            # This is NOT the interview's memory - SessionState.transcript on our
            # side keeps everything. See SESSION_MEMORY.md.
            max_history=10,
        ))
        .with_tts(build_tts(profile.code, voice_id))
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


def swap_agent_persona(
    session,
    new_agent: PanelAgent,
    voice_id: str | None = None,
    language: str | None = None,
) -> None:
    """Hot-swaps the persona on an ALREADY RUNNING session - no new Join call,
    same live Agora instance, per the single-agent-persona-swap decision.

    Two corrections against the SDK source (agora_agent 2.7.2):

    1. `AgentSession.update()` takes ONE POSITIONAL argument, `properties`. The
       previous `session.update(llm={...}, tts={...})` form raised TypeError -
       it would have failed the first time a handoff ever fired.

    2. `UpdateAgentsRequestProperties` declares only `token`, `llm` and `mllm`.
       There is no documented `tts` field, so the TTS voice most likely cannot be
       changed mid-session. The model does allow extra keys, so `tts` is still
       sent below on the chance the REST endpoint honours it - but assume for now
       that every agent in a session shares the voice chosen at start, and that
       distinct per-agent voices need the multi-instance architecture that is
       still an open decision in PROJECT_CONTEXT.
    """
    properties: dict = {
        "llm": {
            "system_messages": [
                {"role": "system", "content": build_system_prompt_from_agent(new_agent, language)}
            ],
            "greeting_message": resolve_greeting(new_agent, language),
            "failure_message": new_agent.behavior.fallbackMessage,
        }
    }

    if voice_id:
        properties["tts"] = {"voice_setting": {"voice_id": voice_id}}

    session.update(properties)


def inject_followup(session, instruction_text: str) -> None:
    """Injects a follow-up instruction into the CURRENTLY loaded persona,
    without switching agents or touching the system prompt/voice.

    This is the FOLLOW_UP action from orchestrator.py, and in knowledge-base mode
    it is also how a specific question from the bank reaches the agent.

    The two action arguments are not optional decoration. As of API v2.7,
    omitting `on_listening_action` makes the server default to "interrupt" - so
    every injected question would cut the candidate off the moment they started
    speaking. That is disastrous in an interview and is the opposite of what the
    orchestrator wants. The SDK docstring names "inject" as the pre-v2.7
    behaviour, which is the behaviour this codebase was written against.

    on_speaking_action="append" matters at session start: the first knowledge-base
    question is injected immediately after the agent begins its greeting, and
    appending lets the greeting finish instead of being talked over.
    """
    session.think(
        instruction_text,
        on_listening_action="inject",   # never talk over the candidate
        on_speaking_action="append",    # let the agent finish its current sentence
    )
