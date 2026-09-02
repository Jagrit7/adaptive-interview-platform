"""Builds the end-of-interview report from session state.

The scoring formula lives here and nowhere else, so there is one definition to
argue with rather than three that quietly disagree.

Design notes worth reading before changing anything:

* A competency can be checked by more than one agent. The panel-level score for
  it is the BEST any agent recorded, matching the per-agent rule that a candidate
  who recovers is credited with the recovery. Averaging across agents would
  punish a candidate for a competency being checked twice, which is a property of
  the panel, not of them.

* `weight` finally does something. It was declared in `Scorer.competencies`,
  editable in the builder, displayed in the read-only view - and read by nothing.
  Every weight anyone set until now had no effect.

* The overall score is a weighted mean of raw scores, not of the covered
  booleans. Booleans throw away the difference between 0.79 and 0.10 against a
  0.80 threshold, and that difference is most of what a report is for. The
  covered checklist is reported alongside it, not instead of it.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.orchestrator.state import SessionState
from app.schemas.panel import Panel
from app.schemas.report import (
    AgentReport,
    CompetencyResult,
    InterviewReport,
    ReportTotals,
    TranscriptEntry,
)

DEFAULT_THRESHOLD = 0.7
DEFAULT_WEIGHT = 1.0

# Bands are descriptive labels for a number the reader can already see. They are
# deliberately coarse: this is practice feedback, not a validated instrument, and
# finer bands would imply a precision the scoring does not have.
BANDS: tuple[tuple[float, str], ...] = (
    (0.85, "Strong"),
    (0.70, "Solid"),
    (0.50, "Developing"),
    (0.00, "Needs work"),
)


def band_for(score: float) -> str:
    for floor, label in BANDS:
        if score >= floor:
            return label
    return BANDS[-1][1]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def build_report(state: SessionState, panel: Panel) -> InterviewReport:
    agents_by_id = {a.id: a for a in panel.agents}
    rules = {c.name: c for c in panel.scorer.competencies}

    # ---- competency roll-up across the whole panel -------------------------
    # name -> (best score, the agents that checked it)
    best: dict[str, float] = {}
    checked_by: dict[str, list[str]] = {}

    for agent_id, agent_state in state.agent_states.items():
        agent_name = agents_by_id[agent_id].identity.name if agent_id in agents_by_id else agent_id
        for name, cs in agent_state.competency_scores.items():
            if cs.score > best.get(name, -1.0):
                best[name] = cs.score
            checked_by.setdefault(name, []).append(agent_name)

    competencies: list[CompetencyResult] = []
    for name in sorted(best):
        rule = rules.get(name)
        threshold = rule.threshold if rule else DEFAULT_THRESHOLD
        weight = rule.weight if rule else DEFAULT_WEIGHT
        score = best[name]
        competencies.append(CompetencyResult(
            name=name,
            score=round(score, 3),
            threshold=threshold,
            weight=weight,
            covered=score >= threshold,
            checked_by=sorted(set(checked_by.get(name, []))),
            # Flagged so a reader can tell a real threshold from a silent default.
            used_default_rule=rule is None,
        ))

    # ---- the formula -------------------------------------------------------
    #
    #   overall = Σ(weight_c × score_c) / Σ(weight_c)
    #
    # A weight of 0 excludes a competency from the overall without hiding it from
    # the checklist, which is a useful way to track something informally.
    weight_sum = sum(c.weight for c in competencies)
    overall = (
        sum(c.weight * c.score for c in competencies) / weight_sum
        if weight_sum > 0 else 0.0
    )

    covered_count = sum(1 for c in competencies if c.covered)

    # ---- knowledge-base coverage, when there was a knowledge base ----------
    coverages = [t.coverage for t in state.transcript if t.coverage is not None]
    kb_coverage = round(sum(coverages) / len(coverages), 3) if coverages else None

    # ---- per-agent breakdown ----------------------------------------------
    agent_reports: list[AgentReport] = []
    for agent_id, agent_state in state.agent_states.items():
        agent = agents_by_id.get(agent_id)
        if agent is None:
            continue
        asked = sum(
            1 for t in state.transcript
            if t.agent_id == agent_id and t.speaker == "candidate"
        )
        agent_reports.append(AgentReport(
            agent_id=agent_id,
            name=agent.identity.name,
            role=agent.identity.role,
            visits=agent_state.visit_count,
            questions_answered=asked,
            satisfaction=round(agent_state.satisfaction(), 3),
            force_closed=agent_state.force_closed,
            competencies=sorted(agent_state.competency_scores.keys()),
            knowledge_questions_asked=len(agent_state.asked_item_ids),
            knowledge_questions_total=len(agent.knowledge.items),
        ))

    # ---- flags raised anywhere in the interview ---------------------------
    flag_counts: dict[str, int] = {}
    for turn in state.transcript:
        for flag in turn.flags:
            flag_counts[flag] = flag_counts.get(flag, 0) + 1

    transcript = [
        TranscriptEntry(
            turn=t.turn_number,
            speaker=t.speaker,
            agent_id=t.agent_id,
            agent_name=agents_by_id[t.agent_id].identity.name if t.agent_id in agents_by_id else t.agent_id,
            text=t.text,
            flags=t.flags,
            coverage=t.coverage,
            knowledge_item_id=t.knowledge_item_id,
        )
        for t in state.transcript
    ]

    return InterviewReport(
        session_id=state.session_id,
        candidate_name=state.candidate_name,
        candidate_ref=state.candidate_ref,
        panel_name=state.panel_project_name,
        language=state.language or "",
        started_at=state.started_at,
        finished_at=state.finished_at or _now(),
        completed=state.is_finished,
        totals=ReportTotals(
            overall_score=round(overall, 3),
            band=band_for(overall),
            competencies_total=len(competencies),
            competencies_covered=covered_count,
            coverage_rate=round(covered_count / len(competencies), 3) if competencies else 0.0,
            knowledge_coverage=kb_coverage,
            questions_answered=sum(1 for t in state.transcript if t.speaker == "candidate"),
            flags=flag_counts,
        ),
        competencies=competencies,
        agents=agent_reports,
        transcript=transcript,
    )
