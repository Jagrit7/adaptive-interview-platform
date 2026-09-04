"""Persisting a finished interview report to Supabase.

Why this lives in the backend at all
------------------------------------
Reports used to be written entirely from the browser (`frontend/lib/reports.ts`,
`saveReport`). That works for an interview the panel owner runs themselves,
because the owner is signed in and `auth.uid()` satisfies the `reports_insert_own`
RLS policy.

It cannot work for a *published* interview. The candidate arrives on an invite
link, is not signed in, and has no Supabase session at all - so `getUser()`
returns nothing and the insert is refused by RLS even if it were attempted. The
report of every real candidate interview was therefore being built, displayed
for a moment, and dropped.

So the published path persists here instead, with the service key, attributing
the row to the panel's owner. That is the only actor who is allowed to read it
back, which keeps the ownership model identical to the browser-written rows: the
enterprise console still selects under `auth.uid() = user_id` and still sees
exactly its own candidates.

Test-mode interviews never reach this module. See the note at the bottom.
"""

from typing import Any

from fastapi import HTTPException

from app import supabase_rest
from app.schemas.report import InterviewReport


# Kept byte-identical in wording to `presentation()` in frontend/lib/reports.ts.
# The two paths write into the same table and are rendered by the same
# component, so a candidate must not be able to tell which one produced their
# row. If you change a sentence here, change it there in the same commit.
_RECOMMENDATION = {
    "Strong": "Strong Hire",
    "Solid": "Hire",
    "Developing": "Consider",
}


def _score_text(score: float) -> str:
    # JavaScript's Math.round is half-up; Python's round() is half-to-even, so
    # 0.845 would render as 84 here and 85 in the browser. Match the browser.
    return f"{int(score * 100 + 0.5)}/100"


def presentation(report: InterviewReport, role_name: str | None = None) -> dict[str, Any]:
    """The denormalised, human-readable projection stored alongside the JSON.

    These columns exist so the reports list and the Ask Reports query can filter
    and rank without opening every `report` document.
    """
    ranked = sorted(report.competencies, key=lambda item: item.score, reverse=True)

    strengths = [
        f"{item.name} was a demonstrated strength ({_score_text(item.score)})."
        for item in ranked if item.covered
    ][:3]
    growth = [
        f"{item.name} needs further evidence or improvement ({_score_text(item.score)})."
        for item in reversed(ranked) if not item.covered
    ][:3]

    recommendation = _RECOMMENDATION.get(report.totals.band or "", "Needs Review")
    role = (role_name or "").strip() or report.panel_name
    candidate = report.candidate_name or "The candidate"

    return {
        "role": role,
        "recommendation": recommendation,
        "strengths": strengths or ["The candidate completed the assessed interview areas."],
        "growth": growth or ["Continue validating performance in a subsequent interview round."],
        "summary": (
            f"{candidate} scored {_score_text(report.totals.overall_score)} in the "
            f"{report.panel_name} interview. The evidence supports a {recommendation} "
            f"recommendation for {role}. {report.totals.competencies_covered} of "
            f"{report.totals.competencies_total} measured competencies met their "
            f"configured thresholds."
        ),
    }


def _panel_owner(panel_id: str) -> str:
    rows = supabase_rest.select(
        "panels",
        {"select": "user_id", "id": f"eq.{panel_id}", "limit": "1"},
        "The panel owner could not be resolved, so the report has no one to belong to.",
    )
    if not rows or not rows[0].get("user_id"):
        raise HTTPException(
            status_code=404,
            detail="This interview's panel no longer exists, so its report cannot be stored.",
        )
    return str(rows[0]["user_id"])


def persist_published_report(
    report: InterviewReport,
    panel_id: str,
    role_name: str | None = None,
) -> str:
    """Store one finished published-interview report. Returns its row id.

    Idempotent: the write upserts on `(user_id, session_id)`, so the two client
    paths that both try to finalise - the interview reaching its natural end and
    the candidate closing the window - converge on one row rather than racing to
    create two.
    """
    owner = _panel_owner(panel_id)
    view = presentation(report, role_name)

    rows = supabase_rest.upsert(
        "interview_reports",
        {
            "user_id": owner,
            "panel_id": panel_id,
            "source": "published",
            "candidate_name": report.candidate_name,
            "candidate_ref": report.candidate_ref,
            "session_id": report.session_id,
            "panel_name": report.panel_name,
            "role_name": view["role"],
            "language": report.language,
            "overall_score": report.totals.overall_score,
            "band": report.totals.band,
            "recommendation": view["recommendation"],
            "executive_summary": view["summary"],
            "strengths": view["strengths"],
            "growth_areas": view["growth"],
            "completed": report.completed,
            "started_at": report.started_at or None,
            "finished_at": report.finished_at or None,
            "report_version": 2,
            "report": report.model_dump(),
        },
        on_conflict="user_id,session_id",
        returning="id",
        failure="The report could not be stored.",
    )
    if not rows:
        raise HTTPException(status_code=502, detail="The report could not be stored.")
    return str(rows[0]["id"])


# Deliberately absent: any `persist_test_report`. A test run of a panel exists to
# let the author hear their own interview back, and its numbers are not evidence
# about a candidate. Storing them would put fake people in the same table the
# hiring decisions are read from. The test flow builds the report, returns it,
# and keeps it in the popup window's React state until that window closes.
