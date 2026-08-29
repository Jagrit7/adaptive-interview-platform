from pydantic import BaseModel
from app.schemas.panel import Agent, CompetencyRule


class ScoreResult(BaseModel):
    competency_scores: dict[str, float]     # competency name -> 0-1 score, for the CURRENT agent only
    flags: list[str]                         # e.g. ["vague"], ["contradiction"]
    triggered_agent_ids: list[str]           # agent_ids whose handoffTriggers matched THIS turn


def build_scoring_prompt(
    current_agent: Agent,
    all_agents: list[Agent],
    transcript_so_far: str,
    latest_answer: str,
) -> str:
    """Composes the single prompt sent to the scoring LLM call each turn."""
    competency_list = ", ".join(current_agent.scoring.competencies) or "none defined"

    trigger_lines = "\n".join(
        f"- {a.identity.name} ({a.id}): {a.turnTaking.handoffTriggers}"
        for a in all_agents
        if a.turnTaking.handoffTriggers.strip()
    )

    return f"""You are scoring one turn of a mock interview.

Current interviewer: {current_agent.identity.name}
Competencies this interviewer is checking: {competency_list}

Full transcript so far:
{transcript_so_far}

Candidate's latest answer:
{latest_answer}

Score each of the current interviewer's competencies from 0.0 to 1.0 based on the latest answer
(and prior context if relevant). Also flag if the answer is vague or contradicts something the
candidate said earlier in the transcript.

Separately, check these handoff conditions against the candidate's answer and full transcript.
List which ones are true RIGHT NOW, if any (this can include the current interviewer's own condition):
{trigger_lines if trigger_lines else "none defined"}

Respond as JSON:
{{
  "competency_scores": {{"<competency>": <0-1 float>, ...}},
  "flags": ["vague" | "contradiction", ...],
  "triggered_agent_ids": ["<agent_id>", ...]
}}
"""


async def score_turn(
    current_agent: Agent,
    all_agents: list[Agent],
    transcript_so_far: str,
    latest_answer: str,
) -> ScoreResult:
    import json
    import os
    from groq import AsyncGroq

    prompt = build_scoring_prompt(current_agent, all_agents, transcript_so_far, latest_answer)

    client = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])

    response = await client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.2,  # scoring should be consistent, not creative
    )

    parsed = json.loads(response.choices[0].message.content)
    return ScoreResult(**parsed)