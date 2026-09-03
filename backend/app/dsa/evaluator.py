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
{code}
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
    response = await client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.1,
    )
    return VerbalEvaluation(**json.loads(response.choices[0].message.content))
