"""Server-side Supabase REST access, using the secret key.

Extracted from `routes/published_panels.py`, which had the credential lookup and
the raw urllib call inline. A second caller now needs both - the published
interview flow has to *write* the finished report, not only read the panel - and
two hand-rolled copies of the same request builder is exactly how the two drift
apart on a header nobody remembers is load-bearing.

The key here bypasses Row Level Security. It belongs only in FastAPI's
environment: never in a `NEXT_PUBLIC_*` variable, and never in a response body.
"""

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException


def is_configured() -> bool:
    """True when the backend can talk to Supabase at all.

    Callers use this to degrade rather than fail: a locally-run interview with
    no Supabase configured should still produce a report on screen, it just
    cannot be stored.
    """
    return bool(
        os.getenv("SUPABASE_URL")
        and (os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
    )


def service_credentials() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise HTTPException(
            status_code=503,
            detail="Published interviews require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend.",
        )
    return url, key


def _headers(key: str, extra: dict[str, str] | None = None) -> dict[str, str]:
    # The newer sb_secret_ keys authenticate on `apikey` alone and reject being
    # sent as a bearer token; the legacy service_role JWT needs both.
    headers = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    if extra:
        headers.update(extra)
    return headers


def _send(request: Request, failure: str) -> list[dict[str, Any]]:
    try:
        with urlopen(request, timeout=10) as response:
            body = response.read()
    except HTTPError as exc:
        # PostgREST puts the real reason (constraint name, missing column) in the
        # body. Surfacing it turns "502 bad gateway" into something debuggable,
        # and none of it contains the key.
        detail = exc.read().decode("utf-8", "replace")[:400] if exc.fp else ""
        raise HTTPException(status_code=502, detail=f"{failure} {detail}".strip()) from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=failure) from exc
    if not body:
        return []
    parsed = json.loads(body)
    return parsed if isinstance(parsed, list) else [parsed]


def select(table: str, params: dict[str, str], failure: str) -> list[dict[str, Any]]:
    url, key = service_credentials()
    request = Request(f"{url}/rest/v1/{table}?{urlencode(params)}", headers=_headers(key))
    return _send(request, failure)


def upsert(
    table: str,
    row: dict[str, Any],
    *,
    on_conflict: str,
    returning: str,
    failure: str,
) -> list[dict[str, Any]]:
    """Insert-or-update one row and return the requested columns.

    `on_conflict` must name a unique index or the write silently becomes a plain
    insert and duplicates on the second call - which is the normal case here,
    because the finish handler and the exit handler both try to persist.
    """
    url, key = service_credentials()
    query = urlencode({"on_conflict": on_conflict, "select": returning})
    request = Request(
        f"{url}/rest/v1/{table}?{query}",
        data=json.dumps(row).encode("utf-8"),
        headers=_headers(key, {"Prefer": "resolution=merge-duplicates,return=representation"}),
        method="POST",
    )
    return _send(request, failure)
