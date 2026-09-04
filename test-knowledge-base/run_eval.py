#!/usr/bin/env python3
"""Knowledge-base evaluation: does the panel grade answers the way a human would?

What this measures
------------------
Loads a knowledge base, walks every question through the real backend pipeline,
and for each one prints:

    the question           - as the agent would ask it
    the reference answer   - what you uploaded as the ideal answer
    the candidate answer   - a simulated response of known quality
    the system's score     - from app.orchestrator.scorer
    the judge's verdict    - an independent LLM comparing reference vs candidate

Then it reports whether the two agree. That is the point: a scorer nobody has
checked is a random number generator with good manners.

What is real and what is simulated
----------------------------------
Real: the parser, the retrieval, the prompt assembly, the scorer prompt.
Simulated: the candidate's voice answers (there is no microphone here) and,
in --offline mode, the two LLM calls.

Candidate answers come from candidates/*.json, each labelled with an expected
quality band. The band is the ground truth the run is measured against - without
it there is nothing to be right or wrong about.

Usage
-----
    # No API key needed. Uses a deterministic stub for both scorer and judge,
    # so the plumbing can be verified without spending anything.
    python run_eval.py --offline

    # Real Groq calls for both the scorer and the judge.
    export GROQ_API_KEY=...
    python run_eval.py --kb ../backend/knowledge-bases/sde-backend-english.csv

    # Stability check: same inputs N times, reports score variance.
    python run_eval.py --repeat 5

Exit code is 1 when agreement falls below --min-agreement, so this can gate CI.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent / "backend"
sys.path.insert(0, str(BACKEND))

from app.knowledge.store import parse_upload, retrieve  # noqa: E402
from app.schemas.panel import Agent, Knowledge, KnowledgeItem  # noqa: E402

DEFAULT_KB = BACKEND / "knowledge-bases" / "sde-backend-english.csv"
CANDIDATES = HERE / "candidates"

# Quality bands and the score window each should land in. Deliberately wide:
# the claim being tested is "the scorer can tell a strong answer from a weak
# one", not "the scorer agrees with me to two decimal places". A narrow window
# would fail on noise and teach you to ignore the test.
BANDS: dict[str, tuple[float, float]] = {
    "strong":  (0.70, 1.00),
    "partial": (0.30, 0.75),
    "weak":    (0.00, 0.40),
    "wrong":   (0.00, 0.25),
}

RESET, BOLD, DIM = "\033[0m", "\033[1m", "\033[2m"
GREEN, RED, YELLOW, CYAN = "\033[32m", "\033[31m", "\033[33m", "\033[36m"


@dataclass
class Case:
    question: str
    reference: str
    candidate: str
    band: str
    item: KnowledgeItem


@dataclass
class Result:
    case: Case
    system_score: float
    coverage: float | None
    missing_points: list[str]
    judge_score: float
    judge_reasoning: str
    in_band: bool
    judge_agrees: bool
    all_scores: list[float] = field(default_factory=list)


# --------------------------------------------------------------- candidates --

def load_candidates(kb_items: list[KnowledgeItem]) -> list[Case]:
    """Pairs each knowledge item with simulated answers of known quality.

    Answers are matched to questions by lexical retrieval - the same retriever
    the scorer uses - so a candidates file does not have to be rewritten every
    time the knowledge base changes order.
    """
    cases: list[Case] = []
    files = sorted(CANDIDATES.glob("*.json"))
    if not files:
        raise SystemExit(f"No candidate files in {CANDIDATES}. See README.md.")

    for path in files:
        payload = json.loads(path.read_text(encoding="utf-8"))
        for entry in payload["answers"]:
            matches = retrieve(kb_items, entry.get("matches") or entry["answer"], k=1)
            if not matches:
                print(f"{YELLOW}  skipped (no matching question): "
                      f"{entry['answer'][:60]}...{RESET}")
                continue
            item = matches[0]
            cases.append(Case(
                question=item.question,
                reference=item.idealAnswer,
                candidate=entry["answer"],
                band=entry["band"],
                item=item,
            ))
    return cases


# ------------------------------------------------------------------- judge --

JUDGE_PROMPT = """You are grading one interview answer against a reference answer.

QUESTION:
{question}

REFERENCE ANSWER (what a complete answer should cover):
{reference}

CANDIDATE'S ANSWER:
{candidate}

Score how well the candidate's answer matches the reference, from 0.0 to 1.0:
  1.0  covers essentially everything the reference calls for
  0.7  covers the main points, misses some detail
  0.4  partially correct, or correct but shallow
  0.1  largely wrong or off-topic
  0.0  no relevant content

Judge substance, not wording or length. Different phrasing that conveys the same
understanding scores the same. Do not reward correct material the reference does
not ask for. Do not penalise the language the answer is written in.

Respond as JSON only:
{{"score": <float>, "reasoning": "<one sentence>"}}
"""


async def judge_answer(case: Case, offline: bool) -> tuple[float, str]:
    if offline:
        return _stub_judge(case)

    from groq import AsyncGroq
    client = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])
    # A different model from the scorer's on purpose. Using the same model to
    # grade its own output measures self-consistency, not correctness - it will
    # happily agree with its own mistakes.
    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": JUDGE_PROMPT.format(
            question=case.question, reference=case.reference, candidate=case.candidate)}],
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    data = json.loads(response.choices[0].message.content)
    return float(data.get("score", 0.0)), str(data.get("reasoning", ""))


def _stub_judge(case: Case) -> tuple[float, str]:
    """Deterministic offline stand-in: token overlap with the reference.

    Crude, and it is meant to be. It exists so the harness itself can be tested
    without an API key. Never read an offline run as evidence about scoring
    quality - it only proves the wiring works.
    """
    import re
    tok = lambda t: {w for w in re.findall(r"[a-z0-9]+", t.lower()) if len(w) > 3}
    ref, cand = tok(case.reference), tok(case.candidate)
    if not ref:
        return 0.5, "offline stub: no reference tokens"
    overlap = len(ref & cand) / len(ref)
    return round(min(1.0, overlap * 2.2), 2), f"offline stub: {len(ref & cand)}/{len(ref)} reference terms present"


# ------------------------------------------------------------ system score --

def build_agent(kb_items: list[KnowledgeItem]) -> Agent:
    return Agent(
        id="eval-agent",
        identity={"name": "Evaluator", "role": "Technical", "color": "#6366f1", "avatar": ""},
        behavior={"systemPrompt": "You are a technical interviewer.", "greetingMessage": "",
                  "fallbackMessage": "", "scenarioBrief": ""},
        logic={"difficultyBand": [1, 10], "seedQuestions": [], "followUpAggressiveness": 5,
               "maxTurns": 99, "maxVisits": 1},
        knowledge=Knowledge(mode="knowledge_base", strict=True, items=kb_items),
        skills={"rolePlayMode": False, "loopUntilSatisfied": True, "contradictionProbing": False},
        tools=[],
        turnTaking={"canOpen": True, "handoffTriggers": "", "priority": "high"},
        scoring={"competencies": ["Knowledge"]},
    )


async def system_score(agent: Agent, case: Case, offline: bool) -> tuple[float, float | None, list[str]]:
    if offline:
        score, _ = _stub_judge(case)
        return score, score, []

    from app.orchestrator.scorer import score_turn
    result = await score_turn(
        current_agent=agent,
        all_agents=[agent],
        transcript_so_far=f"agent: {case.question}",
        latest_answer=case.candidate,
        asked_item_id=case.item.id,
    )
    scores = list(result.competency_scores.values())
    return (sum(scores) / len(scores) if scores else 0.0), result.coverage, result.missing_points


# -------------------------------------------------------------------- run ---

async def run(kb_path: Path, offline: bool, repeat: int, limit: int | None) -> list[Result]:
    items = parse_upload(kb_path.name, kb_path.read_bytes())
    print(f"{BOLD}Knowledge base:{RESET} {kb_path.name} - {len(items)} questions, "
          f"{sum(1 for i in items if i.idealAnswer.strip())} with reference answers\n")

    cases = load_candidates(items)
    if limit:
        cases = cases[:limit]
    agent = build_agent(items)

    results: list[Result] = []
    for index, case in enumerate(cases, start=1):
        runs = [await system_score(agent, case, offline) for _ in range(repeat)]
        scores = [r[0] for r in runs]
        score = statistics.mean(scores)
        _, coverage, missing = runs[0]

        judge, reasoning = await judge_answer(case, offline)

        low, high = BANDS[case.band]
        in_band = low <= score <= high
        agrees = abs(score - judge) <= 0.25

        results.append(Result(case, score, coverage, missing, judge, reasoning,
                              in_band, agrees, scores))

        _print_case(index, case, score, judge, reasoning, coverage, missing, in_band, agrees, scores)

    return results


def _print_case(i, case, score, judge, reasoning, coverage, missing, in_band, agrees, scores):
    print(f"{BOLD}{'─' * 78}{RESET}")
    print(f"{BOLD}[{i}] {case.question}{RESET}")
    print(f"\n{CYAN}REFERENCE ANSWER{RESET}\n  {_wrap(case.reference)}")
    print(f"\n{CYAN}CANDIDATE ANSWER{RESET} {DIM}(expected: {case.band}){RESET}\n  {_wrap(case.candidate)}")

    band_mark = f"{GREEN}in band{RESET}" if in_band else f"{RED}OUT OF BAND{RESET}"
    low, high = BANDS[case.band]
    print(f"\n{CYAN}SYSTEM SCORE{RESET}   {score:.2f}   "
          f"(expected {low:.2f}-{high:.2f} for '{case.band}')  {band_mark}")
    if len(scores) > 1:
        print(f"                {DIM}across {len(scores)} runs: "
              f"{', '.join(f'{s:.2f}' for s in scores)}  "
              f"stdev {statistics.pstdev(scores):.3f}{RESET}")
    if coverage is not None:
        print(f"{CYAN}COVERAGE{RESET}       {coverage:.2f}")
    if missing:
        print(f"{CYAN}MISSING{RESET}        {', '.join(missing[:4])}")

    agree_mark = f"{GREEN}agree{RESET}" if agrees else f"{RED}DISAGREE{RESET}"
    print(f"{CYAN}JUDGE SCORE{RESET}    {judge:.2f}   {agree_mark} "
          f"{DIM}(|Δ| = {abs(score - judge):.2f}){RESET}")
    print(f"{DIM}  {reasoning}{RESET}\n")


def _wrap(text: str, width: int = 74) -> str:
    import textwrap
    return "\n  ".join(textwrap.wrap(text or "(none)", width))


def summarise(results: list[Result], min_agreement: float, offline: bool = False) -> int:
    if not results:
        print(f"{RED}No cases ran.{RESET}")
        return 1

    n = len(results)
    in_band = sum(r.in_band for r in results)
    agree = sum(r.judge_agrees for r in results)
    deltas = [abs(r.system_score - r.judge_score) for r in results]
    agreement = agree / n

    print(f"{BOLD}{'═' * 78}\nSUMMARY{RESET}\n")

    if offline:
        # Said loudly because a green 100% is exactly the kind of number that
        # gets screenshotted. Offline, the scorer and the judge are the SAME
        # stub function, so agreement is 1.0 by construction and measures
        # nothing about scoring quality - only that the harness runs.
        print(f"  {YELLOW}OFFLINE MODE - agreement below is meaningless.{RESET}")
        print(f"  {DIM}The scorer and judge are the same stub, so they cannot disagree.")
        print(f"  This run proves the harness works, not that the scoring does.")
        print(f"  Set GROQ_API_KEY and drop --offline for a real measurement.{RESET}\n")
    print(f"  Cases                     {n}")
    print(f"  Landed in expected band   {in_band}/{n}  ({in_band / n:.0%})")
    print(f"  Judge agreement (±0.25)   {agree}/{n}  ({agreement:.0%})")
    print(f"  Mean |system − judge|     {statistics.mean(deltas):.3f}")
    print(f"  Worst disagreement        {max(deltas):.3f}")

    stdevs = [statistics.pstdev(r.all_scores) for r in results if len(r.all_scores) > 1]
    if stdevs:
        mean_sd = statistics.mean(stdevs)
        verdict = f"{GREEN}stable{RESET}" if mean_sd <= 0.05 else f"{YELLOW}noisy{RESET}"
        print(f"  Mean score stdev          {mean_sd:.3f}  {verdict}  "
              f"{DIM}(>0.05 means scores aren't reproducible enough to show a candidate){RESET}")

    failures = [r for r in results if not r.in_band or not r.judge_agrees]
    if failures:
        print(f"\n{YELLOW}Worth reading by hand:{RESET}")
        for r in failures[:5]:
            why = []
            if not r.in_band:
                why.append(f"scored {r.system_score:.2f}, expected {r.case.band}")
            if not r.judge_agrees:
                why.append(f"judge said {r.judge_score:.2f}")
            print(f"  - {r.case.question[:60]}...  ({'; '.join(why)})")

    print()
    if agreement < min_agreement:
        print(f"{RED}FAIL{RESET}  agreement {agreement:.0%} is below the "
              f"{min_agreement:.0%} threshold.")
        return 1
    print(f"{GREEN}PASS{RESET}  agreement {agreement:.0%} meets the "
          f"{min_agreement:.0%} threshold.")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--kb", type=Path, default=DEFAULT_KB, help="knowledge base file")
    p.add_argument("--offline", action="store_true",
                   help="no API calls; deterministic stub for scorer and judge")
    p.add_argument("--repeat", type=int, default=1,
                   help="score each answer N times to measure variance")
    p.add_argument("--limit", type=int, default=None, help="only the first N cases")
    p.add_argument("--min-agreement", type=float, default=0.7,
                   help="exit 1 below this agreement rate")
    args = p.parse_args()

    if not args.offline and not os.getenv("GROQ_API_KEY"):
        print(f"{RED}GROQ_API_KEY is not set.{RESET} Use --offline to run without it.")
        return 1
    if not args.kb.exists():
        print(f"{RED}No such knowledge base:{RESET} {args.kb}")
        return 1

    results = asyncio.run(run(args.kb, args.offline, args.repeat, args.limit))
    return summarise(results, args.min_agreement, args.offline)


if __name__ == "__main__":
    raise SystemExit(main())
