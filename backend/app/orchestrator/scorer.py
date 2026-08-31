from pydantic import BaseModel

from app.knowledge.store import find_reference_answer, format_reference_for_scorer
from app.schemas.panel import Agent, KnowledgeItem


class ScoreResult(BaseModel):
    competency_scores: dict[str, float]     # competency name -> 0-1 score, for the CURRENT agent only
    flags: list[str]                         # e.g. ["vague"], ["contradiction"]
    triggered_agent_ids: list[str]           # agent_ids whose handoffTriggers matched THIS turn
    coverage: float | None = None            # 0-1, how much of the reference answer was covered
    missing_points: list[str] = []           # what the reference answer had and the candidate didn't


def build_scoring_prompt(
    current_agent: Agent,
    all_agents: list[Agent],
    transcript_so_far: str,
    latest_answer: str,
    reference: KnowledgeItem | None = None,
    language: str | None = None,
) -> str:
    """Composes the single prompt sent to the scoring LLM call each turn."""
    competency_list = ", ".join(current_agent.scoring.competencies) or "none defined"

    trigger_lines = "\n".join(
        f"- {a.identity.name} ({a.id}): {a.turnTaking.handoffTriggers}"
        for a in all_agents
        if a.turnTaking.handoffTriggers.strip()
    )

    reference_block = format_reference_for_scorer(reference)

    # On a non-English panel the transcript is in that language while the
    # uploaded reference answers are almost always English. Without this the
    # grader tends to mark a correct Hindi answer down for "not matching" an
    # English reference it is comparing against literally.
    language_note = ""
    if language and not str(language).startswith("en"):
        from app.config.voice_profiles import get_profile
        language_note = (
            f"\n\nThis interview is conducted in {get_profile(language).label}. The transcript "
            "and the candidate's answer are in that language; the reference material may be in "
            "English. Judge meaning, not language. Never penalise the candidate for the "
            "language they answered in.\n"
        )

    # With a reference answer the scorer measures the candidate against a fixed
    # standard, which makes scores comparable across candidates. Without one it
    # falls back to judging on its own, which is fine but drifts between runs.
    if reference_block:
        grading_instruction = (
            f"{reference_block}\n\n"
            "Score each of the current interviewer's competencies from 0.0 to 1.0, based on how "
            "well the candidate's answer matches the expected answer above. Do not reward correct "
            "material that the expected answer does not call for, and do not penalise different "
            "wording - judge substance. Also report `coverage` (0.0-1.0, the fraction of the "
            "expected answer the candidate actually covered) and `missing_points` (the specific "
            "things the expected answer includes that the candidate did not mention)."
        )
    else:
        grading_instruction = (
            "Score each of the current interviewer's competencies from 0.0 to 1.0 based on the "
            "latest answer (and prior context if relevant). Leave `coverage` null and "
            "`missing_points` empty - there is no reference answer for this question."
        )

    return f"""You are scoring one turn of a mock interview.

Current interviewer: {current_agent.identity.name}
Competencies this interviewer is checking: {competency_list}

Full transcript so far:
{transcript_so_far}

Candidate's latest answer:
{latest_answer}
{language_note}
{grading_instruction}

Also flag if the answer is vague or contradicts something the candidate said earlier
in the transcript.

Separately, check these handoff conditions against the candidate's answer and full transcript.
List which ones are true RIGHT NOW, if any (this can include the current interviewer's own condition):
{trigger_lines if trigger_lines else "none defined"}

Respond as JSON:
{{
  "competency_scores": {{"<competency>": <0-1 float>, ...}},
  "flags": ["vague" | "contradiction", ...],
  "triggered_agent_ids": ["<agent_id>", ...],
  "coverage": <0-1 float or null>,
  "missing_points": ["<point>", ...]
}}
"""


async def score_turn(
    current_agent: Agent,
    all_agents: list[Agent],
    transcript_so_far: str,
    latest_answer: str,
    asked_item_id: str | None = None,
    language: str | None = None,
) -> ScoreResult:
    import json
    import os
    from groq import AsyncGroq

    reference = None
    if current_agent.knowledge.is_active():
        reference = find_reference_answer(
            current_agent.knowledge.items, asked_item_id, latest_answer
        )

    prompt = build_scoring_prompt(
        current_agent, all_agents, transcript_so_far, latest_answer, reference, language
    )

    client = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])

    response = await client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.2,  # scoring should be consistent, not creative
    )

    parsed = json.loads(response.choices[0].message.content)

    # The model occasionally returns nulls or omits the optional fields entirely;
    # normalise rather than let a 500 kill a live interview mid-turn.
    parsed.setdefault("competency_scores", {})
    parsed.setdefault("flags", [])
    parsed.setdefault("triggered_agent_ids", [])
    parsed["missing_points"] = parsed.get("missing_points") or []

    return ScoreResult(**parsed)
