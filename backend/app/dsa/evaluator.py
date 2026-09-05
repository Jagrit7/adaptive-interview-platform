from __future__ import annotations

import json
import os

from groq import AsyncGroq
from pydantic import BaseModel, Field


class VerbalEvaluation(BaseModel):
    complexity_score: float = Field(ge=0, le=1)
    clarity_score: float = Field(ge=0, le=1)
    feedback: str
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)


async def evaluate_verbal_answer(
    code: str, answer: str, passed: int, total: int, *, question_title: str,
    question_prompt: str, expected_time: str, expected_space: str, follow_up: str,
) -> VerbalEvaluation:
    if not answer.strip():
        return VerbalEvaluation(
            complexity_score=0,
            clarity_score=0,
            feedback="No verbal answer was captured, so complexity and reasoning could not be evaluated.",
            improvements=["Explain the algorithm, its time complexity, and its space complexity out loud."],
        )

    prompt = f"""You are evaluating one DSA interview follow-up.

Question: {question_title}
Problem: {question_prompt}
Candidate code:
```python
{code[:6000]}
```
Automated tests passed: {passed}/{total}
Follow-up: {follow_up}
Candidate answer: {answer}

Judge the answer itself, not speaking accent or grammar. The editorial target is {expected_time} time and
{expected_space} auxiliary space, but accept a correctly derived complexity for a different submitted approach.

Return JSON only:
{{
  "complexity_score": <0.0-1.0>,
  "clarity_score": <0.0-1.0>,
  "feedback": "two or three useful sentences",
  "strengths": ["specific strength"],
  "improvements": ["specific improvement"]
}}
"""
    client = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])
    try:
        response = await client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            # gpt-oss-120b reasons before it answers, and this call sits on the
            # report path where the candidate is already waiting. Low effort
            # here, rather than a token cap: capping max_tokens on a reasoning
            # model starves the output instead of shortening the thinking.
            reasoning_effort="low",
            max_tokens=1_500,
            temperature=0.1,
        )
        return VerbalEvaluation(**json.loads(response.choices[0].message.content or "{}"))
    except Exception as exc:
        # This was the last unguarded LLM call in the codebase, and it sat at
        # the worst possible point: a grader hiccup here raised out of
        # /dsa/sessions/{id}/finish, so a candidate who had just completed a
        # whole interview lost the report rather than the paragraph of verbal
        # feedback inside it.
        #
        # The code score is computed from the test run and is unaffected, so the
        # report is still worth producing. Zeros rather than a middling guess:
        # the verbal answer genuinely was not assessed, and inventing a score
        # for it would be worse than recording that it is missing.
        print(f"[dsa evaluator] verbal evaluation unavailable: {exc}")
        return VerbalEvaluation(
            complexity_score=0.0,
            clarity_score=0.0,
            feedback=(
                "The spoken answer could not be evaluated automatically this time. "
                "The code score below is unaffected."
            ),
            improvements=["Ask for this round to be re-scored if the verbal answer mattered to you."],
        )
