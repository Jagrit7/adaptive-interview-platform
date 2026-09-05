# Evaluating the panels

"Evaluate the panel" splits into two questions that need different metrics:

- **Candidate metrics** — what the panel outputs about the person. This is the
  product.
- **Panel-quality metrics** — whether the panel is any good at its job. This is
  what tells you your product works, and it is the half most interview products
  skip.

A score you cannot defend is worse than no score, so the second set matters more
than it looks.

---

## Part 1 — Candidate metrics (what the panel produces)

### Already implemented

| Metric | Where it lives | What it means |
|---|---|---|
| Per-competency score, 0–1 | `AgentSessionState.competency_scores[c].score` | Best score seen for that competency across the whole session |
| Covered (bool) | `.covered` | Score cleared the threshold in `Scorer.competencies` |
| Satisfaction, 0–1 | `AgentSessionState.satisfaction()` | Fraction of one agent's competencies covered |
| Coverage, 0–1 | `ScoreResult.coverage` | How much of the uploaded ideal answer the candidate actually hit. **Only meaningful in knowledge-base mode** |
| Missing points | `ScoreResult.missing_points` | Named gaps against the reference answer |
| Flags | `ScoreResult.flags` | `vague`, `contradiction` |
| Visits, force-close | `visit_count`, `force_closed` | Force-closed means the agent ran out of visits without being satisfied — a weak signal on its own, a strong one combined with low satisfaction |

Note the deliberate design choice in `apply_score_result`: it keeps the **best**
score per competency, not the latest and not the mean. A candidate who flounders
and then recovers is credited with the recovery. That is a defensible choice for
a practice tool. For a hiring tool you would probably want the *last* score or a
recency-weighted one, since the point there is to measure where they ended up.
It's one line if you want to change it.

### Worth adding, cheap

**Weighted overall score.** `Scorer.competencies` already carries `weight` and
nothing reads it. The obvious aggregate:

```
overall = Σ(weight_c × score_c) / Σ(weight_c)
```

Report it next to the per-competency breakdown, never instead of it — a single
number invites exactly the over-interpretation you want to avoid.

**Evidence per competency.** Store the `turn_number` that produced each best
score. Then a report can say "System Design 0.8, based on turn 7" and link to the
transcript. This is the single highest-value addition on the list: it turns a
score into something a human can check, and it costs one field.

**Depth reached.** Track the difficulty of the hardest question answered above
threshold. "Handled difficulty 7" is more informative to a candidate than "0.72".

**Recovery after probing.** Score before a follow-up vs after. A candidate who
goes 0.3 → 0.8 when pushed is different from one who stays at 0.3, and the
difference is often what an interviewer actually cares about.

**Answer latency and length.** Already derivable from the transcript. Useful as
context, dangerous as a score — treat as descriptive only.

### Metrics to be careful with

Speaking rate, filler words, sentiment, and "confidence" all correlate with
accent, first language, neurotype, and nerves far more than with competence. They
also happen to be easy to compute, which is why products ship them. If you add
them, keep them descriptive and out of the score. On a Hindi or Japanese panel
they are close to meaningless.

---

## Part 2 — Panel-quality metrics (is the panel any good?)

### Coverage and efficiency

| Metric | How to compute | Why it matters |
|---|---|---|
| Competency coverage | Competencies scored at least once ÷ competencies declared | An uncovered competency means the panel never actually tested something it claims to measure |
| Question efficiency | Competencies covered ÷ questions asked | How much signal per minute of the candidate's time |
| Bank utilisation | `len(asked_item_ids)` ÷ `len(knowledge.items)` | Consistently low means the banks are too big for `maxTurns` |
| Dead air / stall rate | Turns producing no score change | The agent asked something that told you nothing |
| Redundancy | Cosine or token overlap between questions from different agents | Two agents asking the same thing wastes a slot. `knowledge.store.retrieve()` already does the similarity maths |

### Handoff quality

The orchestrator's handoff logic is the most novel part of this system and the
least verified.

- **Trigger precision** — of the handoffs fired by `triggered_agent_ids`, how
  many look correct on a human read of the transcript? Sample 20 and label them.
- **Handoff latency** — turns between a trigger condition becoming true and the
  switch. Requires labelled transcripts.
- **Thrash rate** — switches per session; A→B→A→B means the trigger conditions
  overlap and need rewriting.
- **Persona bleed** — after a swap, does the new agent reference things only the
  previous one would say? This is a real risk given how memory works (see
  `SESSION_MEMORY.md`) and it is checkable by grepping transcripts for the
  previous agent's topic keywords right after a switch.

### Scoring reliability — the important ones

**Test–retest.** Replay the same transcript through `score_turn` five times and
compute the standard deviation per competency. Temperature is 0.2 so it should
be small; if it is above ~0.05 the scores are not stable enough to show a
candidate. This is trivially automatable and needs no labels:

```python
scores = [await score_turn(agent, agents, transcript, answer, item_id) for _ in range(5)]
# stdev per competency
```

**Agreement with humans.** The real validation. Have 2–3 people score 30–50
recorded answers, then compute:
- Krippendorff's α or Cohen's κ between humans (establishes the ceiling — if
  humans only agree at 0.6, the model will not beat that)
- Model-vs-human correlation (Spearman, since the scale is ordinal in practice)
- Mean absolute error on the 0–1 scale

**Knowledge-base grounding.** Compare scores with and without the reference
answer on the same answers. If they barely differ, the knowledge base is not
doing anything and you have a prompting bug.

**Position bias.** Does the same answer score differently at turn 2 vs turn 8?
Shuffle question order across runs and check.

**Adverse impact.** If this is ever used for real hiring decisions, score
distributions by gender, first language, and accent are not optional. The
four-fifths rule is the usual starting point. Worth measuring even for a practice
tool, because "we never checked" is not a position you want to be in.

### Operational

Turn latency (answer ends → next question starts) is the metric that decides
whether the thing feels like a conversation. Budget: STT finalisation, one
scoring call, one `think()` round trip. Anything over ~2s reads as broken. Also
worth tracking: scorer JSON parse failures, `session.update()` failures, and how
often `pick_next_question` returns `None` earlier than expected.

---

## What I would actually measure first

For a hackathon demo, in this order:

1. **Turn latency.** If it feels laggy, nothing else matters.
2. **Test–retest stability.** Cheap, needs no labels, and tells you whether the
   scores mean anything.
3. **Competency coverage.** Catches panels misconfigured so badly they never test
   what they claim to.
4. **Handoff precision on 20 hand-read transcripts.** The handoff logic is your
   differentiator and it is currently unverified against real conversations.

Everything else can wait for real users.

---

## A caveat worth stating out loud

Every score here comes from one LLM call grading a transcript against a reference
answer. That is a reasonable way to give someone practice feedback. It is not a
validated instrument for hiring decisions, and the gap between those two things
is large — occupational-psychology validation involves criterion validity against
actual job performance, which no amount of prompt engineering substitutes for.

Presenting these numbers as practice signal is honest. Presenting them as a
hiring score is not, unless you do the human-agreement work in Part 2 and publish
the numbers.
