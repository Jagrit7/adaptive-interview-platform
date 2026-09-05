# Knowledge-base evaluation

Answers one question: **when someone answers a knowledge-base question, does the
system score it the way a human would?**

An unchecked scorer is a random number generator with good manners. This harness
is how you find out whether yours is one.

## What it does

For every case it prints the question, the reference answer you uploaded, a
simulated candidate answer of known quality, the score the real backend gives it,
and an independent LLM judge's score. Then it reports whether those two agree.

Real: the parser, retrieval, prompt assembly, and `app.orchestrator.scorer`.
Simulated: the candidate's spoken answers, and both LLM calls under `--offline`.

## Running it

```bash
cd test-knowledge-base

# No API key. Deterministic stub for both sides - verifies the plumbing only.
python run_eval.py --offline

# The real thing.
export GROQ_API_KEY=...
python run_eval.py

# A different knowledge base.
python run_eval.py --kb ../backend/knowledge-bases/product-manager.json

# Stability: score each answer 5 times, report variance.
python run_eval.py --repeat 5
```

Dependencies are the backend's own (`pip install -r ../backend/requirements.txt`).
Nothing extra.

## Reading the output

**Landed in expected band** — can the scorer separate a strong answer from a
weak one? This is the primary signal. The bands are wide on purpose; the claim
being tested is discrimination, not agreement to two decimal places.

**Judge agreement** — do two independent models reach a similar number?
Below ~70% means the scoring prompt is underdetermined, and no amount of
threshold-tuning fixes that.

**Mean score stdev** (with `--repeat`) — same input, same output? Above 0.05 and
the scores are not reproducible enough to show a candidate. This is the cheapest
useful metric in the whole system: it needs no labels and no ground truth.

**Worth reading by hand** — the disagreements. These are the only rows worth
your time. A case where the system says 0.8 and the judge says 0.3 is either a
scoring bug or a badly written reference answer, and you cannot tell which
without reading it.

## Two things it deliberately does not do

**Offline mode proves nothing about quality.** The scorer and judge are the same
stub function, so they agree by construction. The run prints a warning saying so.

**The judge is not ground truth.** It is a second opinion from a different model
(`llama-3.3-70b` against the scorer's `gpt-oss-120b`) — using the same model to
grade its own output measures self-consistency, and it will happily agree with
its own mistakes. Two models agreeing raises confidence; it does not establish
correctness. For that you need humans scoring the same answers, which is the
Part 2 work in `EVALUATION.md`.

## Adding cases

`candidates/*.json`:

```json
{
  "answers": [
    {
      "band": "strong",
      "matches": "keywords steering the retriever to the right question",
      "answer": "the candidate's answer"
    }
  ]
}
```

Bands are `strong`, `partial`, `weak`, `wrong`, with score windows defined in
`BANDS` at the top of `run_eval.py`. Answers are matched to questions by the same
lexical retriever the scorer uses, so reordering the knowledge base doesn't break
the file.

The most valuable cases to add are the ones you expect to be hard: a correct
answer phrased completely unlike the reference, a fluent answer that is subtly
wrong, and a partial answer that name-drops the right terms without understanding
them. Those are where scorers fail, and where an easy test set will tell you
everything is fine.

## CI

Exits 1 when agreement falls below `--min-agreement` (default 0.7).

```bash
python run_eval.py --min-agreement 0.75
```
