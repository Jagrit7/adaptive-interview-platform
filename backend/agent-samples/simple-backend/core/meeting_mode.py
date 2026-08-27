"""Generic meeting-mode helpers for simple-backend."""

import base64
import hashlib
import hmac
import json
import time
import urllib.parse
import urllib.request

from core.signing import build_signature_headers


def verify_join_bootstrap(secret, token):
    if not secret or not token or "." not in token:
        return None
    encoded, signature = token.split(".", 1)
    expected = hmac.new(secret.encode("utf-8"), encoded.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return None
    padded = encoded + "=" * (-len(encoded) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    exp = int(payload.get("exp") or 0)
    if exp and exp < int(time.time()):
        return None
    return payload


def meeting_mode_enabled(constants):
    return bool(
        constants.get("CONSULTANT_DASHBOARD_URL")
        and constants.get("CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET")
    )


def authorize_meeting_join(constants, payload):
    if not meeting_mode_enabled(constants):
        return {"ok": False, "error": "Meeting mode is not configured."}

    body = json.dumps(payload, separators=(",", ":"))
    path = "/internal/authorize-meeting-join"
    headers = build_signature_headers(
        constants["CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET"],
        "POST",
        path,
        body,
    )
    headers["Content-Type"] = "application/json"
    url = urllib.parse.urljoin(constants["CONSULTANT_DASHBOARD_URL"].rstrip("/") + "/", path.lstrip("/"))
    request_obj = urllib.request.Request(url, data=body.encode("utf-8"), headers=headers, method="POST")
    timeout_seconds = int(constants.get("CONSULTANT_DASHBOARD_TIMEOUT_SECONDS") or 5)

    try:
        with urllib.request.urlopen(request_obj, timeout=timeout_seconds) as response:
            return {"ok": True, "status": response.status, "data": json.loads(response.read().decode("utf-8"))}
    except urllib.error.HTTPError as exc:
        payload = {}
        try:
            payload = json.loads(exc.read().decode("utf-8"))
        except Exception:
            payload = {}
        return {
            "ok": False,
            "status": exc.code,
            "error": payload.get("error") or f"meeting_join_denied_{exc.code}",
        }
    except Exception as exc:
        return {"ok": False, "status": 503, "error": f"meeting_join_failed:{exc}"}


def notify_meeting_end(constants, payload):
    return notify_meeting_event(constants, "/internal/meeting-ended", payload)


def notify_meeting_event(constants, path, payload):
    if not meeting_mode_enabled(constants):
        return {"ok": False, "error": "Meeting mode is not configured."}

    body = json.dumps(payload, separators=(",", ":"))
    headers = build_signature_headers(
        constants["CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET"],
        "POST",
        path,
        body,
    )
    headers["Content-Type"] = "application/json"
    url = urllib.parse.urljoin(constants["CONSULTANT_DASHBOARD_URL"].rstrip("/") + "/", path.lstrip("/"))
    request_obj = urllib.request.Request(url, data=body.encode("utf-8"), headers=headers, method="POST")
    timeout_seconds = int(constants.get("CONSULTANT_DASHBOARD_TIMEOUT_SECONDS") or 5)

    try:
        with urllib.request.urlopen(request_obj, timeout=timeout_seconds) as response:
            return {"ok": True, "status": response.status, "data": json.loads(response.read().decode("utf-8"))}
    except urllib.error.HTTPError as exc:
        payload = {}
        try:
            payload = json.loads(exc.read().decode("utf-8"))
        except Exception:
            payload = {}
        return {
            "ok": False,
            "status": exc.code,
            "error": payload.get("error") or f"meeting_end_denied_{exc.code}",
        }
    except Exception as exc:
        return {"ok": False, "status": 503, "error": f"meeting_end_failed:{exc}"}
