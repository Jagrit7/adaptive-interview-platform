"""Loading a panel's runtime configuration, server-side.

Previously `routes/published_panels.py`, which combined this lookup with the
shared-invite-code endpoints. Those endpoints are gone - see the note in
`routes/invitations.py` - but the lookup they used is still needed, so it lives
here on its own rather than inside a routes module that no longer routes.
"""

from typing import Any

from fastapi import HTTPException

from app import supabase_rest
from app.schemas.panel import Panel


def load_panel_config(panel_id: str) -> Panel:
    """Fetch and validate a published panel by id.

    Still gated on `status == 'published'`, so archiving or reverting an
    interview to draft takes effect immediately for everyone holding a link -
    without anybody having to revoke invitations one by one.
    """
    rows: list[dict[str, Any]] = supabase_rest.select(
        "panels",
        {"select": "config", "id": f"eq.{panel_id}", "limit": "1"},
        "The interview could not be loaded from Supabase.",
    )
    if not rows:
        raise HTTPException(status_code=404, detail=UNAVAILABLE)

    config = rows[0].get("config") or {}
    enterprise = config.get("enterprise") or {}
    if enterprise.get("status") != "published":
        raise HTTPException(status_code=403, detail=UNAVAILABLE)

    try:
        return Panel.model_validate(config)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="The interview configuration is invalid.") from exc


UNAVAILABLE = "This interview is not currently open. Contact the hiring team if you think that is wrong."
