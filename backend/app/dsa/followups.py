"""Choosing the verbal follow-up from what the candidate actually submitted.

Extracted from routes/dsa_sessions.py because routes/job_panels.py had its own,
much older copy of the same decision: a bare `question["followups"][0]["prompt"]`.
Two implementations of one rule is how the job panel ended up asking a candidate
who passed every test to reflect on not knowing the answer - the trigger-keyed
prompts were added and ordered for the skill path, and nothing updated the
index the panel was reading.

It is one function in one place now, so the next change to the wording cannot
reach one caller and miss the other.
"""

from typing import Any

from app.dsa.question_bank import DEFAULT_FOLLOWUP, DEFAULT_FOLLOWUPS_BY_TRIGGER


def submission_trigger(code: str, starter: str, test_run: dict[str, Any] | None,
                       *, gave_up: bool = False) -> str:
    """Classify a submission so the follow-up can respond to it.

    Compared against the starter code, not just emptiness: a candidate who
    submits the untouched template has written nothing, and treating that as an
    attempt is what produced "walk me through your complexity" for a blank
    editor.
    """
    if gave_up:
        return "gave_up"
    normalized = "".join((code or "").split())
    if not normalized or normalized == "".join((starter or "").split()):
        return "no_code"
    total = (test_run or {}).get("total") or 0
    passed = (test_run or {}).get("passed") or 0
    if total == 0:
        return "always"
    if passed == 0:
        return "none_passed"
    return "all_passed" if passed >= total else "partial"


def followup_for(question: dict[str, Any], trigger: str) -> str:
    """The question's own prompt for this trigger, else the built-in one.

    `.get("followups")` rather than `[...]`: only the local seed bank attaches
    them, so a question loaded from Supabase has no such key and indexing it
    raised a KeyError that 500'd the submission and left the session pinned in
    its coding phase with no way out.
    """
    followups = question.get("followups") or []
    by_key = {item.get("trigger_key", "always"): item.get("prompt", "") for item in followups}
    for key in (trigger, "always"):
        if by_key.get(key):
            return by_key[key]
    return DEFAULT_FOLLOWUPS_BY_TRIGGER.get(trigger, DEFAULT_FOLLOWUP)


def outcome_briefing(trigger: str, test_run: dict[str, Any] | None) -> str:
    """What to tell the agent about the submission it is about to discuss.

    Without it the agent knows only the question, and praises solutions that
    failed every test.
    """
    total = (test_run or {}).get("total") or 0
    passed = (test_run or {}).get("passed") or 0
    return {
        "gave_up": "They said they do not know how to solve this and asked to move on. Accept that "
                   "gracefully in one short sentence, without reassurance speeches, and do not ask "
                   "them to attempt it anyway.",
        "no_code": "They submitted no code at all. Do not congratulate them and do not ask about "
                   "optimisation - there is nothing to optimise. Be warm and matter-of-fact.",
        "none_passed": f"Their code passed 0 of {total} tests. Do not call the solution correct or "
                       "ask them to optimise it.",
        "partial": f"Their code passed {passed} of {total} tests, so it is partially working. "
                   "Acknowledge that honestly - neither congratulate a full solution nor dismiss it.",
        "all_passed": f"Their code passed all {total} tests.",
        "always": "",
    }.get(trigger, "")
