"""Resolving and enforcing per-candidate interview invitations.

The authorisation model
-----------------------
A published interview used to be one shared link with one 8-character code, so
"authorised candidate" meant "anyone who has the URL". This module replaces that
with one row per invited candidate.

Two things are checked, and both matter:

  1. the token in the link, which is 256 bits of randomness and is the actual
     credential; and
  2. the email the candidate types, which must equal the invited address.

The email alone would be worthless - addresses are public and guessable, so an
allowlist plus a shared link is barely stronger than the shared link on its own.
The token alone would be adequate until someone forwards their link. Together
the forwarded-link case needs the recipient to also know which address the
invitation was issued to, and the guessed-address case needs the token.

Every check runs here, server-side. The frontend re-checks nothing it is trusted
on: `verify` exists purely so a mistyped address does not burn an attempt.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from app import supabase_rest


TERMINAL_STATUSES = {"revoked"}


def normalize_email(value: str) -> str:
    return value.strip().lower()


def mask_email(value: str) -> str:
    """`priya.sharma@acme.com` -> `p***a@acme.com`.

    Enough for an invited candidate to recognise their own address, not enough
    for someone holding a forwarded link to reconstruct it.
    """
    local, _, domain = value.partition("@")
    if not domain:
        return "***"
    if len(local) <= 2:
        return f"{local[:1]}***@{domain}"
    return f"{local[0]}***{local[-1]}@{domain}"


def load_invitation(token: str) -> dict[str, Any]:
    rows = supabase_rest.select(
        "interview_invitations",
        {"select": "*", "token": f"eq.{token}", "limit": "1"},
        "The invitation could not be loaded.",
    )
    if not rows:
        # Deliberately the same message as an expired or revoked invitation.
        # Distinguishing them would let someone with a list of guessed tokens
        # learn which ones exist.
        raise HTTPException(status_code=404, detail=INVALID_INVITE)
    return rows[0]


INVALID_INVITE = "This interview invitation is invalid, expired, or no longer available."


def _expired(invitation: dict[str, Any]) -> bool:
    raw = invitation.get("expires_at")
    if not raw:
        return False
    try:
        expires = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return False
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires < datetime.now(timezone.utc)


def assert_usable(invitation: dict[str, Any]) -> None:
    """Reject an invitation that exists but must not be used to start again.

    `completed` is not terminal by itself: a panel configured with more than one
    attempt should let the candidate come back. `attempts` is what actually
    bounds that, so it is the only counter consulted here.
    """
    if invitation.get("status") in TERMINAL_STATUSES:
        raise HTTPException(status_code=403, detail=INVALID_INVITE)
    if _expired(invitation):
        raise HTTPException(status_code=403, detail=INVALID_INVITE)
    attempts = int(invitation.get("attempts") or 0)
    allowed = int(invitation.get("max_attempts") or 1)
    if attempts >= allowed:
        raise HTTPException(
            status_code=403,
            detail=(
                f"This interview has already been taken {attempts} time"
                f"{'' if attempts == 1 else 's'}, which is the limit set for it. "
                "Contact the hiring team if you need another attempt."
            ),
        )


def assert_email_matches(invitation: dict[str, Any], email: str) -> None:
    if normalize_email(email) != normalize_email(str(invitation.get("email") or "")):
        raise HTTPException(
            status_code=403,
            detail="That email address does not match the one this interview was sent to.",
        )


def authorize(token: str, email: str) -> dict[str, Any]:
    """Full gate: the invitation exists, is usable, and belongs to this email."""
    invitation = load_invitation(token)
    assert_usable(invitation)
    assert_email_matches(invitation, email)
    return invitation


def _patch(invitation_id: str, changes: dict[str, Any], failure: str) -> None:
    supabase_rest.patch(
        "interview_invitations",
        {"id": f"eq.{invitation_id}"},
        changes,
        failure,
    )


def mark_started(invitation: dict[str, Any], session_id: str) -> None:
    """Record the attempt.

    Counted at start rather than at completion, so abandoning the interview
    halfway still consumes it. Otherwise a candidate could restart indefinitely
    by quitting before the last question, which defeats `max_attempts`
    entirely.
    """
    _patch(
        str(invitation["id"]),
        {
            "status": "started",
            "attempts": int(invitation.get("attempts") or 0) + 1,
            "started_at": invitation.get("started_at") or datetime.now(timezone.utc).isoformat(),
            "session_id": session_id,
        },
        "The invitation could not be updated.",
    )


def mark_completed(invitation_id: str, report_id: str | None) -> None:
    changes: dict[str, Any] = {
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    if report_id:
        changes["report_id"] = report_id
    _patch(invitation_id, changes, "The invitation could not be closed out.")
