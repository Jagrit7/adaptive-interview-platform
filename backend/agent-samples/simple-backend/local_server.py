"""
Local Flask server for Agora Conversational AI

This is a thin wrapper that:
1. Loads .env file into environment
2. Extracts parameters from HTTP request
3. Calls core business logic (same as Lambda!)
4. Returns HTTP JSON response
"""

from dotenv import load_dotenv
load_dotenv(override=True)  # Load .env file before importing core modules, override existing env vars

import json
import os
import threading
import time
import urllib.error
import urllib.request
from uuid import uuid4

from flask import Flask, request, jsonify, session, abort
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename

from photo.vision import analyse_image
from photo.crop import crop_for_avatar, normalize_orientation
from photo.voices import pick_voice, pick_gemini_voice
from core.config import initialize_constants
from core.tokens import build_token_with_rtm
from core.agent import create_agent_payload, send_agent_to_channel, hangup_agent, speak_to_agent, build_auth_header
from core.auth import auth_bp, get_authenticated_user_id
from core.consultant_dashboard import (
    dashboard_client_required,
    fetch_dashboard_context,
    fetch_dashboard_meeting_signals,
    resolve_dashboard_client,
)
from core.meeting_mode import authorize_meeting_join, notify_meeting_end, notify_meeting_event, verify_join_bootstrap
from core.utils import generate_random_channel
from core import news_channel
from x.profile_prompt import XApiError, build_profile_overrides_from_handle
import copy
import re

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')
# Trust nginx forwarded proto/host so absolute URLs (e.g. OAuth callbacks)
# are generated with the public HTTPS origin.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)


class TenantPrefixMiddleware:
    def __init__(self, app):
        self.app = app

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "")
        if path.startswith("/v/"):
            parts = path.split("/")
            if len(parts) >= 3 and parts[2]:
                vendor_slug = parts[2].strip().lower()
                environ["mindfix.vendor_slug"] = vendor_slug
                current_script = environ.get("SCRIPT_NAME", "")
                environ["SCRIPT_NAME"] = f"{current_script}/v/{vendor_slug}".rstrip("/")
                suffix = "/" + "/".join(parts[3:])
                environ["PATH_INFO"] = suffix or "/"
        return self.app(environ, start_response)


app.wsgi_app = TenantPrefixMiddleware(app.wsgi_app)
app.register_blueprint(auth_bp)


_max_duration_timers: dict[str, threading.Timer] = {}
_max_duration_lock = threading.Lock()


def _schedule_max_duration_hangup(agent_id: str, constants: dict, query_params: dict | None = None) -> None:
    """Auto-hangup an agent after MAX_CALL_DURATION_SECONDS. Cancellable on manual hangup.

    Override priority: query_params['max_call_duration_seconds'] > constants > '600'.
    A value of 0 (or negative / unparseable) disables the timer entirely — useful
    for event demos with `?max_call_duration_seconds=0` or the EVENTDEMO profile.
    """
    raw = (
        (query_params or {}).get("max_call_duration_seconds")
        or str(constants.get("MAX_CALL_DURATION_SECONDS", "600"))
    )
    raw = str(raw).strip()
    try:
        duration = int(raw)
    except ValueError:
        return
    if duration <= 0:
        print(f"[MaxDuration] Disabled for agent {agent_id} (duration={duration})", flush=True)
        return

    constants_snapshot = dict(constants)

    def _fire():
        try:
            hangup_agent(agent_id, constants_snapshot)
            print(f"[MaxDuration] Auto-hung up agent {agent_id} after {duration}s", flush=True)
        except Exception as exc:
            print(f"[MaxDuration] Auto-hangup of agent {agent_id} failed: {exc}", flush=True)
        finally:
            with _max_duration_lock:
                _max_duration_timers.pop(agent_id, None)

    timer = threading.Timer(duration, _fire)
    timer.daemon = True
    with _max_duration_lock:
        existing = _max_duration_timers.pop(agent_id, None)
        if existing is not None:
            existing.cancel()
        _max_duration_timers[agent_id] = timer
    timer.start()
    print(f"[MaxDuration] Scheduled hangup of agent {agent_id} in {duration}s", flush=True)


def _cancel_max_duration_timer(agent_id: str) -> None:
    with _max_duration_lock:
        timer = _max_duration_timers.pop(agent_id, None)
    if timer is not None:
        timer.cancel()


def _apply_xhandle_overrides(query_params, constants, *, skip=False):
    xhandle = (query_params.get("xhandle") or "").strip()
    if not xhandle or skip:
        return

    try:
        overrides = build_profile_overrides_from_handle(
            xhandle,
            bearer_token=constants.get("X_API_BEARER_TOKEN"),
            timeout_seconds=float(constants.get("X_API_TIMEOUT_SECONDS", "8")),
        )
    except XApiError as exc:
        app.logger.warning("xhandle '%s' fetch failed, falling back to profile defaults: %s", xhandle, exc)
        return

    if overrides.get("prompt"):
        query_params["prompt"] = overrides["prompt"]
    if overrides.get("greeting"):
        query_params["greeting"] = overrides["greeting"]
    if overrides.get("avatar_id"):
        query_params["avatar_id"] = overrides["avatar_id"]


@app.context_processor
def inject_tenant_helpers():
    vendor_slug = ((request.environ.get("mindfix.vendor_slug") or session.get("auth_vendor_slug") or "").strip().lower())

    def tenant_path(path: str) -> str:
        target = (path or "/").strip() or "/"
        if target.startswith("http://") or target.startswith("https://"):
            return target
        if not target.startswith("/"):
            target = "/" + target
        if not vendor_slug or target.startswith("/v/"):
            return target
        return f"/v/{vendor_slug}{target}"

    return {
        "tenant_path": tenant_path,
        "current_vendor_slug": vendor_slug,
    }

# Keys in agent payload that contain secrets and must be redacted
_SENSITIVE_KEYS = re.compile(
    r'(key|token|api_key|secret|certificate|password|authorization|credentials)',
    re.IGNORECASE
)


def _redact_payload(obj):
    """Deep-clone a payload and redact sensitive fields so no secrets leak to clients."""
    if isinstance(obj, dict):
        result = {}
        for k, v in obj.items():
            if _SENSITIVE_KEYS.search(k) and isinstance(v, str) and len(v) > 8:
                result[k] = v[:4] + '***' + v[-4:]
            else:
                result[k] = _redact_payload(v)
        return result
    elif isinstance(obj, (list, tuple)):
        return [_redact_payload(item) for item in obj]
    return obj


def _derive_llm_base_url(constants):
    agent_server_url = (constants.get("AGENT_SERVER_URL") or "").strip()
    if agent_server_url:
        return agent_server_url.rstrip("/")
    llm_url = constants.get("LLM_URL", "")
    if "/chat/completions" in llm_url:
        return llm_url.rsplit("/chat/completions", 1)[0]
    return llm_url.rstrip("/")


def _custom_llm_secret(constants):
    return (
        constants.get("AGENT_SERVER_SHARED_SECRET")
        or os.environ.get("AGENT_SERVER_SHARED_SECRET")
        or ""
    )


def _custom_llm_headers(constants):
    headers = {"Content-Type": "application/json"}
    secret = _custom_llm_secret(constants)
    if secret:
        headers["X-Agent-Server-Secret"] = secret
    return headers


def _post_custom_llm(url, payload, label, constants=None):
    def _run():
        try:
            req_data = json.dumps(payload).encode("utf-8")
            req_obj = urllib.request.Request(
                url,
                data=req_data,
                headers=_custom_llm_headers(constants or {}),
                method="POST",
            )
            with urllib.request.urlopen(req_obj, timeout=5) as resp:
                print(f"[{label}] POST {url} → {resp.status}")
        except Exception as exc:
            print(f"[{label}] FAILED POST {url}: {exc}")
    threading.Thread(target=_run, daemon=True).start()


def _post_custom_llm_sync(url, payload, label, timeout=5, constants=None):
    try:
        req_data = json.dumps(payload).encode("utf-8")
        req_obj = urllib.request.Request(
            url,
            data=req_data,
            headers=_custom_llm_headers(constants or {}),
            method="POST",
        )
        with urllib.request.urlopen(req_obj, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "ignore")
            print(f"[{label}] POST {url} → {resp.status}")
            return {"ok": True, "status": resp.status, "body": body}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        print(f"[{label}] POST {url} → {exc.code}")
        return {"ok": False, "status": exc.code, "body": body, "error": body or str(exc)}
    except Exception as exc:
        print(f"[{label}] FAILED POST {url}: {exc}")
        return {"ok": False, "error": str(exc)}


def _authorize_guest_meeting_identity(req, constants, expected_client_id):
    user_id, _, auth_error = get_authenticated_user_id(req, constants)
    if auth_error:
        return {"ok": False, "status": 401, "error": auth_error}
    if not user_id or user_id == "anonymous":
        return {"ok": True}

    dashboard_result = resolve_dashboard_client(constants, user_id_hash=user_id)
    if dashboard_result.get("status") != "resolved":
        return {
            "ok": False,
            "status": 403,
            "error": dashboard_result.get("error", "Account not found. Please contact your consultant."),
        }
    if expected_client_id and dashboard_result.get("client_id") != expected_client_id:
        return {"ok": False, "status": 403, "error": "Authenticated account does not match this meeting."}
    return {"ok": True, "client_id": dashboard_result.get("client_id", "")}


@app.after_request
def after_request(response):
    """Add CORS headers to all responses.

    Uses explicit origin (not '*') when an Authorization header is present,
    since browsers require a specific origin for credentialed requests.
    """
    origin = request.headers.get('Origin', '')
    if origin:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
    else:
        response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response


@app.route('/start-agent', methods=['GET'])
def start_agent():
    """
    Start an agent and return connection details.

    Query Parameters:
        channel: Channel name (auto-generated if not provided)
        profile: Profile name for env var overrides
        connect: "true" (default) to start agent, "false" for token-only
        pipeline_id: Agent Builder pipeline ID (overrides inline LLM/TTS/ASR config)
        debug: Include debug info in response

    Examples:
        GET /start-agent?channel=test
        GET /start-agent?channel=test&profile=sales
        GET /start-agent?connect=false
    """
    # Get query parameters from HTTP request
    query_params = request.args.to_dict()

    # Get optional profile parameter (normalize to lowercase)
    profile = query_params.get('profile')
    if profile:
        profile = profile.lower()

    # Initialize constants with profile
    constants = initialize_constants(profile)

    # Auth check — returns 'anonymous' when auth is not configured
    user_id, user_name, auth_error = get_authenticated_user_id(request, constants)
    if auth_error:
        return jsonify({"error": auth_error}), 401
    query_params['user_id'] = user_id
    if user_name:
        query_params['user_name'] = user_name

    dashboard_context = fetch_dashboard_context(constants, user_id)
    if dashboard_client_required(constants) and dashboard_context.get('status') != 'resolved':
        return jsonify({
            "error": dashboard_context.get('error', 'Account not found. Please contact your consultant.')
        }), 403
    if dashboard_context.get('status') == 'resolved' and dashboard_context.get('prompt_addition'):
        base_prompt = query_params.get('prompt', constants["DEFAULT_PROMPT"])
        query_params['prompt'] = f"{base_prompt}\n\n{dashboard_context['prompt_addition']}"
    scheduled_meeting_id = (query_params.get("scheduled_meeting_id") or "").strip()
    scheduled_meeting_signals = None
    if scheduled_meeting_id:
        scheduled_meeting_signals = fetch_dashboard_meeting_signals(constants, scheduled_meeting_id)

    # Get or generate channel
    channel = query_params.get('channel') or generate_random_channel(10)
    session_id = (query_params.get('session_id') or '').strip() or str(uuid4())
    query_params['session_id'] = session_id

    # Check if token-only mode
    token_only_mode = query_params.get('connect', 'true').lower() == 'false'

    # Apply xhandle persona overrides (skipped in token-only mode to avoid wasted X API calls)
    _apply_xhandle_overrides(query_params, constants, skip=token_only_mode)

    # Check if avatar mode is enabled (avatar vendor determines mode)
    avatar_vendor = constants.get("AVATAR_VENDOR")

    # Use regular APP_ID (profile-aware, so AVATAR_APP_ID if profile=avatar)
    app_id_to_use = constants["APP_ID"]

    # Check if we have APP_CERTIFICATE for token generation
    has_certificate = bool(constants["APP_CERTIFICATE"] and constants["APP_CERTIFICATE"].strip())

    # RTM UID includes channel for uniqueness, like agent does — otherwise
    # concurrent sessions on the same App ID collide on a single "101"
    # RTM identity and DMs cross-wire between rooms.
    user_rtm_uid = f"{constants['USER_UID']}-{channel}"
    if has_certificate:
        user_token_data = build_token_with_rtm(channel, constants["USER_UID"], constants, rtm_uid=user_rtm_uid)
        agent_video_token_data = build_token_with_rtm(channel, constants["AGENT_VIDEO_UID"], constants)
    else:
        user_token_data = {"token": constants["APP_ID"], "uid": constants["USER_UID"]}
        agent_video_token_data = {"token": constants["APP_ID"], "uid": constants["AGENT_VIDEO_UID"]}

    # Token-only mode response
    if token_only_mode:
        return jsonify({
            "audio_scenario": "10",
            "token": user_token_data["token"],
            "uid": user_token_data["uid"],
            "channel": channel,
            "appid": app_id_to_use,
            "user_token": user_token_data,
            "agent_video_token": agent_video_token_data,
            "agent": {
                "uid": constants["AGENT_UID"]
            },
            "agent_rtm_uid": f"{constants['AGENT_UID']}-{channel}",
            "user_rtm_uid": user_rtm_uid,
            "enable_string_uid": False,
            "token_generation_method": "v007 tokens with RTC+RTM services" if has_certificate else "APP_ID only (no APP_CERTIFICATE)",
            "agent_response": {
                "status_code": 200,
                "response": {"message": "Token-only mode: tokens generated successfully", "mode": "token_only", "connect": False},
                "success": True
            },
            "session_id": session_id,
            "transcription_enabled": bool(
                scheduled_meeting_signals and scheduled_meeting_signals.get("transcription_enabled")
            ),
            "audio_biomarkers_enabled": bool(
                True if not scheduled_meeting_signals else scheduled_meeting_signals.get("audio_biomarkers_enabled", True)
            ),
            "video_biomarkers_enabled": bool(
                True if not scheduled_meeting_signals else scheduled_meeting_signals.get("video_biomarkers_enabled", True)
            ),
        })

    # Normal flow: create and send agent
    try:
        agent_payload = create_agent_payload(
            channel=channel,
            constants=constants,
            query_params=query_params,
            agent_video_token=agent_video_token_data["token"]
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    # Send agent to channel
    agent_response = send_agent_to_channel(channel, agent_payload, constants)

    # Register agent_id with custom LLM (non-blocking)
    if agent_response.get("success"):
        try:
            resp_body = json.loads(agent_response.get("response", "{}"))
            agent_id = resp_body.get("agent_id")
            if agent_id:
                _schedule_max_duration_hangup(agent_id, constants, query_params)
                llm_base = _derive_llm_base_url(constants)
                register_url = f"{llm_base}/register-agent"
                # Extract custom LLM params (tokens, UIDs, API keys)
                # so custom-llm can start audio subscriber + Thymia immediately
                llm_params = (agent_payload.get("properties", {}).get("llm", {}).get("params", {})
                    or agent_payload.get("properties", {}).get("overrides", {}).get("llm", {}).get("params", {}))
                register_payload = {
                    "app_id": app_id_to_use,
                    "channel": channel,
                    "agent_id": agent_id,
                    "auth_header": build_auth_header(constants),
                    "agent_endpoint": constants.get("AGENT_ENDPOINT",
                        "https://api.agora.io/api/conversational-ai-agent/v2/projects"),
                    "prompt": constants.get("DEFAULT_PROMPT", ""),
                    "user_uid": llm_params.get("user_uid"),
                    "subscriber_token": llm_params.get("subscriber_token"),
                    "rtm_token": llm_params.get("rtm_token"),
                    "rtm_uid": llm_params.get("rtm_uid"),
                    "thymia_api_key": llm_params.get("thymia_api_key"),
                    "user_id": user_id,
                    "user_name": query_params.get('user_name', ''),
                    "max_session_duration": int(constants.get("MAX_SESSION_DURATION") or 0),
                    "session_id": session_id,
                }
                if dashboard_context:
                    register_payload.update({
                        "client_id": dashboard_context.get("client_id", ""),
                        "consultant_id": dashboard_context.get("consultant_id", ""),
                        "consultant_name": dashboard_context.get("consultant_name", ""),
                        "consultant_dashboard_url": constants.get("CONSULTANT_DASHBOARD_URL", ""),
                        "consultant_dashboard_shared_secret": constants.get("CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET", ""),
                        "profile_name": constants.get("PROFILE_NAME", "default"),
                        "meeting_id": query_params.get("scheduled_meeting_id", ""),
                    })
                if scheduled_meeting_signals:
                    register_payload.update({
                        "transcription_enabled": bool(scheduled_meeting_signals.get("transcription_enabled")),
                        "audio_biomarkers_enabled": bool(scheduled_meeting_signals.get("audio_biomarkers_enabled", True)),
                        "video_biomarkers_enabled": bool(scheduled_meeting_signals.get("video_biomarkers_enabled", True)),
                    })
                def _register():
                    try:
                        req_data = json.dumps(register_payload).encode('utf-8')
                        req_obj = urllib.request.Request(
                            register_url, data=req_data,
                            headers=_custom_llm_headers(constants),
                            method='POST'
                        )
                        with urllib.request.urlopen(req_obj, timeout=5) as resp:
                            print(f"[RegisterAgent] POST {register_url} → {resp.status} agent_id={agent_id}")
                    except Exception as e:
                        print(f"[RegisterAgent] FAILED POST {register_url}: {e}")
                threading.Thread(target=_register, daemon=True).start()
        except Exception as e:
            print(f"[RegisterAgent] Error parsing agent response: {e}")

    # Build response
    response_data = {
        "audio_scenario": "10",
        "token": user_token_data["token"],
        "uid": user_token_data["uid"],
        "channel": channel,
        "appid": app_id_to_use,
        "user_token": user_token_data,
        "agent_video_token": agent_video_token_data,
        "agent": {
            "uid": constants["AGENT_UID"]
        },
        "agent_rtm_uid": f"{constants['AGENT_UID']}-{channel}",
        "user_rtm_uid": user_rtm_uid,
        "enable_string_uid": False,
        "agent_response": agent_response,
        "session_id": session_id,
        "transcription_enabled": bool(
            scheduled_meeting_signals and scheduled_meeting_signals.get("transcription_enabled")
        ),
        "audio_biomarkers_enabled": bool(
            True if not scheduled_meeting_signals else scheduled_meeting_signals.get("audio_biomarkers_enabled", True)
        ),
        "video_biomarkers_enabled": bool(
            True if not scheduled_meeting_signals else scheduled_meeting_signals.get("video_biomarkers_enabled", True)
        ),
    }

    # Add debug info if requested (redact secrets)
    if 'debug' in query_params:
        response_data["debug"] = {
            "agent_payload": _redact_payload(agent_payload),
            "channel": channel,
            "api_url": f"{constants.get('AGENT_ENDPOINT', 'https://api.agora.io/api/conversational-ai-agent/v2/projects')}/{constants['APP_ID']}/join",
            "token_generation_method": "v007 tokens with RTC+RTM services" if has_certificate else "APP_ID only (no APP_CERTIFICATE)",
            "has_app_certificate": has_certificate
        }

    return jsonify(response_data)


@app.route('/join-meeting', methods=['POST'])
def join_meeting():
    payload = request.get_json(force=True, silent=True) or {}
    profile = (payload.get('profile') or '').lower() or None
    constants = initialize_constants(profile)

    join_bootstrap = payload.get('join_bootstrap', '')
    access_token = payload.get('access_token', '')

    auth_payload = None
    guest_identity = None
    if join_bootstrap:
        verified = verify_join_bootstrap(
            constants.get('CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET', ''),
            join_bootstrap,
        )
        if not verified:
            return jsonify({"error": "Invalid or expired meeting bootstrap."}), 403
        participant_role = verified.get("participant_role", "host")
        auth_payload = {"participant_role": participant_role}
        if participant_role == "host":
            auth_payload.update({
                "meeting_id": verified.get("meeting_id", ""),
                "consultant_id": verified.get("consultant_id", ""),
            })
        else:
            auth_payload.update({
                "meeting_id": verified.get("meeting_id", ""),
                "response_access_link_id": verified.get("response_access_link_id", ""),
            })
    elif access_token:
        auth_payload = {
            "participant_role": "guest",
            "access_token": access_token,
        }
    else:
        return jsonify({"error": "access_token or join_bootstrap is required"}), 400

    if auth_payload.get("participant_role") == "guest":
        guest_identity = _authorize_guest_meeting_identity(request, constants, "")
        if not guest_identity.get("ok"):
            return jsonify({"error": guest_identity.get("error", "Authentication required")}), int(
                guest_identity.get("status") or 401
            )

    auth_result = authorize_meeting_join(constants, auth_payload)
    if not auth_result.get("ok"):
        status = int(auth_result.get("status") or 403)
        return jsonify({"error": auth_result.get("error", "meeting_join_denied")}), status

    join_data = auth_result["data"]
    if join_data.get("participant_role") == "guest" and guest_identity and guest_identity.get("client_id"):
        if guest_identity.get("client_id") != join_data.get("client_id", ""):
            return jsonify({"error": "Authenticated account does not match this meeting."}), 403
    print(
        "[MeetingJoin] "
        f"meeting_id={join_data.get('meeting_id')} "
        f"role={join_data.get('participant_role')} "
        f"ensure={join_data.get('ensure_meeting_services')} "
        f"stt={join_data.get('transcription_enabled')} "
        f"audio_biomarkers_enabled={join_data.get('audio_biomarkers_enabled', True)} "
        f"video_biomarkers_enabled={join_data.get('video_biomarkers_enabled', True)} "
        f"channel={join_data.get('channel_name')}"
    )
    channel = join_data["channel_name"]
    participant_uid = str(join_data["participant_uid"])
    participant_rtm_uid = participant_uid
    participant_token = build_token_with_rtm(
        channel,
        participant_uid,
        constants,
        rtm_uid=participant_rtm_uid,
    )

    transcription_enabled = bool(join_data.get("transcription_enabled"))
    audio_biomarkers_enabled = (
        bool(join_data.get("audio_biomarkers_enabled"))
        if "audio_biomarkers_enabled" in join_data
        else False
    )
    video_biomarkers_enabled = (
        bool(join_data.get("video_biomarkers_enabled"))
        if "video_biomarkers_enabled" in join_data
        else False
    )
    should_register_meeting_services = bool(join_data.get("ensure_meeting_services")) or any(
        (
            transcription_enabled,
            audio_biomarkers_enabled,
            video_biomarkers_enabled,
        )
    )

    if should_register_meeting_services:
        sub_token_info = build_token_with_rtm(channel, "5000", constants)
        llm_rtm_uid = join_data.get("rtm_uid") or "5001"
        rtm_token_info = build_token_with_rtm(channel, "5001", constants, rtm_uid=llm_rtm_uid)
        transcription_bot_uid = "104" if transcription_enabled else ""
        transcription_bot_token = ""
        if transcription_enabled:
            transcription_bot_token = build_token_with_rtm(channel, transcription_bot_uid, constants)["token"]
        llm_base = _derive_llm_base_url(constants)
        register_url = f"{llm_base}/register-agent"
        register_payload = {
            "app_id": constants["APP_ID"],
            "channel": channel,
            "agent_id": f"meeting:{join_data['meeting_id']}",
            "auth_header": "",
            "agent_endpoint": "",
            "prompt": "",
            "user_uid": join_data.get("user_uid", "101"),
            "subscriber_token": sub_token_info["token"],
            "rtm_token": rtm_token_info["token"],
            "rtm_uid": llm_rtm_uid,
            "thymia_api_key": constants.get("THYMIA_API_KEY", ""),
            "client_id": join_data.get("client_id", ""),
            "consultant_id": join_data.get("consultant_id", ""),
            "consultant_dashboard_url": constants.get("CONSULTANT_DASHBOARD_URL", ""),
            "consultant_dashboard_shared_secret": constants.get("CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET", ""),
            "meeting_context_url": constants.get("CONSULTANT_DASHBOARD_URL", ""),
            "meeting_shared_secret": constants.get("CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET", ""),
            "profile_name": constants.get("PROFILE_NAME", "default"),
            "meeting_mode": True,
            "meeting_id": join_data.get("meeting_id", ""),
            "session_id": f"meeting-{join_data.get('meeting_id', '')}",
            "meeting_runtime_key": join_data.get("meeting_runtime_key", ""),
            "participant_role": join_data.get("participant_role", ""),
            "host_uid": join_data.get("host_uid", "103"),
            "guest_uid": join_data.get("guest_uid", "101"),
            "ai_speaking_enabled": False,
            "transcription_enabled": transcription_enabled,
            "audio_biomarkers_enabled": audio_biomarkers_enabled,
            "video_biomarkers_enabled": video_biomarkers_enabled,
            "transcription_provider": join_data.get("transcription_provider", ""),
            "transcription_language": join_data.get("transcription_language", ""),
            "transcription_bot_uid": transcription_bot_uid,
            "transcription_bot_token": transcription_bot_token,
        }
        print(
            "[RegisterMeeting] "
            f"meeting_id={join_data.get('meeting_id')} "
            f"runtime={join_data.get('meeting_runtime_key', '')} "
            f"channel={channel} "
            f"role={join_data.get('participant_role')} "
            f"ensure={join_data.get('ensure_meeting_services')} "
            f"stt={transcription_enabled} "
            f"audio_biomarkers_enabled={audio_biomarkers_enabled} "
            f"video_biomarkers_enabled={video_biomarkers_enabled} "
            f"thymia_key={'yes' if constants.get('THYMIA_API_KEY', '') else 'no'} "
            f"rtm_uid={llm_rtm_uid}"
        )
        register_result = None
        for _attempt in range(3):
            register_result = _post_custom_llm_sync(register_url, register_payload, "RegisterMeeting", constants=constants)
            if register_result.get("ok") or int(register_result.get("status") or 0) != 409:
                break
            time.sleep(0.5)
        if int(register_result.get("status") or 0) == 409:
            print(
                "[RegisterMeeting] "
                f"meeting_id={join_data.get('meeting_id')} "
                f"channel={channel} already initialized; reusing existing services"
            )
            register_result["ok"] = True
        elif register_result.get("ok"):
            print(
                "[RegisterMeeting] "
                f"meeting_id={join_data.get('meeting_id')} "
                f"channel={channel} register-agent ok"
            )
        if not register_result.get("ok"):
            return jsonify({
                "error": "Meeting services failed to initialize.",
                "details": register_result.get("error", "register_failed"),
            }), 502

    return jsonify({
        "mode": "meeting",
        "meeting_mode": True,
        "meeting_id": join_data["meeting_id"],
        "session_id": f"meeting-{join_data['meeting_id']}",
        "meeting_runtime_key": join_data.get("meeting_runtime_key", ""),
        "participant_role": join_data["participant_role"],
        "transcription_enabled": transcription_enabled,
        "audio_biomarkers_enabled": audio_biomarkers_enabled,
        "video_biomarkers_enabled": video_biomarkers_enabled,
        "channel": channel,
        "appid": constants["APP_ID"],
        "token": participant_token["token"],
        "uid": participant_uid,
        "rtm_uid": participant_rtm_uid,
        "user_token": participant_token,
        "user_rtm_uid": participant_rtm_uid,
        "host_uid": join_data.get("host_uid", "103"),
        "guest_uid": join_data.get("guest_uid", "101"),
        "scheduled_start_at": join_data.get("scheduled_start_at", ""),
        "scheduled_end_at": join_data.get("scheduled_end_at", ""),
    })


@app.route('/end-meeting', methods=['POST'])
def end_meeting():
    payload = request.get_json(force=True, silent=True) or {}
    profile = (payload.get('profile') or '').lower() or None
    constants = initialize_constants(profile)
    join_bootstrap = payload.get('join_bootstrap', '')
    verified = verify_join_bootstrap(
        constants.get('CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET', ''),
        join_bootstrap,
    )
    if not verified or verified.get("participant_role") != "host":
        return jsonify({"error": "Only the host can end this meeting."}), 403

    meeting_id = verified.get("meeting_id", "")
    channel = verified.get("channel_name", "")
    if not meeting_id or not channel:
        return jsonify({"error": "Missing meeting context."}), 400

    notify_result = notify_meeting_end(
        constants,
        {
            "meeting_id": meeting_id,
            "participant_role": "host",
            "ended_by_role": "host",
            "ended_by_id": verified.get("consultant_id", ""),
        },
    )
    if not notify_result.get("ok"):
        status = int(notify_result.get("status") or 502)
        return jsonify({"error": notify_result.get("error", "meeting_end_notify_failed")}), status

    llm_base = _derive_llm_base_url(constants)
    unregister_url = f"{llm_base}/unregister-agent"
    unregister_payload = {
        "app_id": constants["APP_ID"],
        "channel": channel,
        "agent_id": f"meeting:{meeting_id}",
        "meeting_runtime_key": f"{constants['APP_ID']}:{channel}:{meeting_id}",
        "transcript": payload.get("transcript") or None,
    }
    unregister_result = _post_custom_llm_sync(
        unregister_url,
        unregister_payload,
        "UnregisterMeeting",
        timeout=15,
        constants=constants,
    )
    if not unregister_result.get("ok"):
        return jsonify({
            "error": "Meeting cleanup failed.",
            "details": unregister_result.get("error") or unregister_result.get("body", ""),
        }), 502
    return jsonify({"ok": True})


@app.route('/meeting-participant-event', methods=['POST'])
def meeting_participant_event():
    payload = request.get_json(force=True, silent=True) or {}
    profile = (payload.get('profile') or '').lower() or None
    constants = initialize_constants(profile)
    event_name = (payload.get('event') or '').strip().lower()
    if event_name not in {'joined', 'left'}:
        return jsonify({"error": "event must be joined or left"}), 400

    join_bootstrap = payload.get('join_bootstrap', '')
    access_token = payload.get('access_token', '')
    guest_identity = None
    if join_bootstrap:
        verified = verify_join_bootstrap(
            constants.get('CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET', ''),
            join_bootstrap,
        )
        if not verified:
            return jsonify({"error": "Invalid or expired meeting bootstrap."}), 403
        participant_role = verified.get("participant_role", "host")
        auth_payload = {"participant_role": participant_role}
        if participant_role == "host":
            auth_payload.update({
                "meeting_id": verified.get("meeting_id", ""),
                "consultant_id": verified.get("consultant_id", ""),
            })
        else:
            auth_payload.update({
                "meeting_id": verified.get("meeting_id", ""),
                "response_access_link_id": verified.get("response_access_link_id", ""),
            })
    elif access_token:
        auth_payload = {"participant_role": "guest", "access_token": access_token}
    else:
        return jsonify({"error": "access_token or join_bootstrap is required"}), 400

    if auth_payload.get("participant_role") == "guest":
        guest_identity = _authorize_guest_meeting_identity(request, constants, "")
        if not guest_identity.get("ok"):
            return jsonify({"error": guest_identity.get("error", "Authentication required")}), int(
                guest_identity.get("status") or 401
            )

    auth_result = authorize_meeting_join(constants, auth_payload)
    if not auth_result.get("ok"):
        status = int(auth_result.get("status") or 403)
        return jsonify({"error": auth_result.get("error", "meeting_event_denied")}), status
    join_data = auth_result["data"]
    if join_data.get("participant_role") == "guest" and guest_identity and guest_identity.get("client_id"):
        if guest_identity.get("client_id") != join_data.get("client_id", ""):
            return jsonify({"error": "Authenticated account does not match this meeting."}), 403
    path = "/internal/meeting-joined" if event_name == "joined" else "/internal/meeting-left"
    notify_result = notify_meeting_event(
        constants,
        path,
        {
            "meeting_id": join_data["meeting_id"],
            "participant_role": join_data["participant_role"],
            "participant_id": join_data.get("consultant_id" if join_data["participant_role"] == "host" else "client_id", ""),
        },
    )
    if not notify_result.get("ok"):
        status = int(notify_result.get("status") or 502)
        return jsonify({"error": notify_result.get("error", "meeting_event_failed")}), status
    return jsonify({"ok": True})


@app.route('/hangup-agent', methods=['GET'])
def hangup_agent_route():
    """
    Disconnect an agent from the channel.

    Query Parameters:
        agent_id: The agent ID to disconnect (required)
        profile: Profile name for env var overrides

    Example:
        GET /hangup-agent?agent_id=abc123
    """
    # Get query parameters
    query_params = request.args.to_dict()

    # Get optional profile parameter (normalize to lowercase)
    profile = query_params.get('profile')
    if profile:
        profile = profile.lower()

    # Initialize constants
    constants = initialize_constants(profile)

    # Check for required agent_id
    if 'agent_id' not in query_params:
        return jsonify({"error": "Missing agent_id parameter"}), 400

    agent_id = query_params['agent_id']
    _cancel_max_duration_timer(agent_id)
    hangup_response = hangup_agent(agent_id, constants)

    # Unregister agent from custom LLM (non-blocking) to clean up audio subscriber + Thymia
    try:
        llm_base = _derive_llm_base_url(constants)
        unregister_url = f"{llm_base}/unregister-agent"
        channel = query_params.get('channel', '')
        app_id = constants["APP_ID"]
        unregister_payload = {"app_id": app_id, "channel": channel, "agent_id": agent_id}
        def _unregister():
            try:
                req_data = json.dumps(unregister_payload).encode('utf-8')
                req_obj = urllib.request.Request(
                    unregister_url, data=req_data,
                    headers=_custom_llm_headers(constants),
                    method='POST'
                )
                with urllib.request.urlopen(req_obj, timeout=5) as resp:
                    print(f"[UnregisterAgent] POST {unregister_url} → {resp.status} agent_id={agent_id}")
            except Exception as e:
                print(f"[UnregisterAgent] FAILED POST {unregister_url}: {e}")
        threading.Thread(target=_unregister, daemon=True).start()
    except Exception as e:
        print(f"[UnregisterAgent] Error: {e}")

    return jsonify({
        "agent_response": hangup_response
    })


@app.route('/speak', methods=['POST'])
def speak():
    """
    Push text to an agent's TTS pipeline via the Agora Speak API.

    JSON Body:
        agent_id: The agent ID to speak to (required)
        text: The text to speak (required)
        profile: Profile name for env var overrides (optional, defaults to "video")
        priority: "INTERRUPT" or "APPEND" (optional, defaults to "APPEND")

    Example:
        POST /speak
        {"agent_id": "abc123", "text": "Goal! 1-0!", "priority": "INTERRUPT"}
    """
    data = request.get_json(force=True, silent=True) or {}

    agent_id = data.get('agent_id')
    text = data.get('text')

    if not agent_id:
        return jsonify({"error": "Missing agent_id"}), 400
    if not text:
        return jsonify({"error": "Missing text"}), 400

    profile = (data.get('profile') or 'video').lower()
    priority = data.get('priority', 'APPEND').upper()
    if priority not in ('INTERRUPT', 'APPEND'):
        priority = 'APPEND'

    constants = initialize_constants(profile)
    result = speak_to_agent(agent_id, text, constants, priority)

    print(f"[Speak] agent={agent_id} priority={priority} status={result['status_code']} text={text[:80]}")

    if not result['success']:
        return jsonify({"error": result['response'], "status_code": result['status_code']}), result['status_code']

    return jsonify(result)


# ---------------------------------------------------------------------------
# /news demo — shared-channel viewer + RSS/HN reader bot
# ---------------------------------------------------------------------------

NEWS_DEFAULT_CHANNEL = os.environ.get("NEWS_DEFAULT_CHANNEL", "news-default")
NEWS_DEFAULT_PROFILE = os.environ.get("NEWS_DEFAULT_PROFILE", "news")


def _news_start_agent(channel: str, profile: str, constants: dict) -> str | None:
    """Spin up a ConvoAI agent for the news channel and return its agent_id.

    No user audio is ever published from the viewer page, so the agent's
    MLLM never sees input — its sole job is to render the avatar and
    accept /speak pushes. We still need a working LLM/avatar block, so
    we re-use create_agent_payload() with empty query_params.

    Adopts the existing agent if ConvoAI reports a TaskConflict — that
    means the agent is still running from before (e.g. after a backend
    restart that dropped our in-memory channel state). The error body
    in that case carries the live agent_id, which we reuse here so
    the viewer joins the still-running session instead of erroring out.
    """
    agent_video_token_data = build_token_with_rtm(channel, constants["AGENT_VIDEO_UID"], constants)
    query_params: dict[str, str] = {}
    payload = create_agent_payload(
        channel=channel,
        constants=constants,
        query_params=query_params,
        agent_video_token=agent_video_token_data["token"],
    )
    resp = send_agent_to_channel(channel, payload, constants)
    raw = resp.get("response", "{}") or "{}"
    try:
        body = json.loads(raw)
    except (ValueError, TypeError):
        body = {}
    if resp.get("success"):
        return body.get("agent_id")
    if (body.get("reason") == "TaskConflict") and body.get("agent_id"):
        print(
            f"[news] adopting existing agent={body['agent_id']} on channel={channel} "
            f"(ConvoAI reported TaskConflict — leftover from prior session)",
            flush=True,
        )
        return body["agent_id"]
    raise RuntimeError(f"send_agent_to_channel failed: {raw}")


def _resolve_news_profile(query_params):
    profile = (query_params.get("profile") or NEWS_DEFAULT_PROFILE).lower()
    return profile, initialize_constants(profile)


def _news_channel_from(query_params):
    return (query_params.get("channel") or NEWS_DEFAULT_CHANNEL).strip() or NEWS_DEFAULT_CHANNEL


@app.route('/news/join', methods=['POST', 'GET'])
def news_join():
    """Register a viewer on a news channel. First joiner spins up the
    avatar agent + reader thread. Returns Agora tokens for listen-only
    subscribe — viewer must NOT publish a local mic track.
    """
    query_params = request.args.to_dict()
    if request.method == 'POST':
        body = request.get_json(silent=True) or {}
        query_params.update({k: str(v) for k, v in body.items() if v is not None})
    profile, constants = _resolve_news_profile(query_params)
    channel = _news_channel_from(query_params)
    try:
        state, session_id, was_first = news_channel.join(
            channel=channel,
            profile=profile,
            constants=constants,
            start_agent_fn=_news_start_agent,
            speak_fn=speak_to_agent,
            hangup_fn=hangup_agent,
        )
    except Exception as e:
        app.logger.exception("[news] join failed channel=%s profile=%s", channel, profile)
        return jsonify({"error": str(e)}), 500

    # Issue a viewer token. Each viewer gets a unique RTC UID derived
    # from the session_id so multiple watchers can coexist on one
    # channel without UID clashes.
    viewer_uid = int(uuid4().int % 1_000_000) + 100_000
    if constants.get("APP_CERTIFICATE"):
        # rtm_uid must be a string; default would inherit the int and crash.
        viewer_token = build_token_with_rtm(
            channel, viewer_uid, constants, rtm_uid=str(viewer_uid),
        ).get("token")
    else:
        viewer_token = constants["APP_ID"]
    return jsonify({
        "app_id": constants["APP_ID"],
        "channel": channel,
        "profile": profile,
        "uid": viewer_uid,
        "token": viewer_token,
        "agent_uid": constants.get("AGENT_VIDEO_UID") or constants.get("AGENT_UID"),
        "session_id": session_id,
        "was_first": was_first,
        "agent_id": state.agent_id,
        # The viewer needs to know whose video to subscribe to.
        "subscribe_to_uid": constants.get("AGENT_VIDEO_UID") or constants.get("AGENT_UID"),
    })


@app.route('/news/heartbeat', methods=['POST'])
def news_heartbeat():
    body = request.get_json(silent=True) or {}
    channel = (body.get("channel") or NEWS_DEFAULT_CHANNEL).strip() or NEWS_DEFAULT_CHANNEL
    session_id = (body.get("session_id") or "").strip()
    if not session_id:
        return jsonify({"error": "session_id required"}), 400
    ok = news_channel.heartbeat(channel, session_id)
    return jsonify({"ok": ok})


@app.route('/news/leave', methods=['POST'])
def news_leave():
    # Accept JSON, form-encoded (sendBeacon), or raw query — beacons
    # often arrive as text/plain with a JSON body in the data.
    body: dict = {}
    if request.is_json:
        body = request.get_json(silent=True) or {}
    elif request.form:
        body = request.form.to_dict()
    else:
        raw = request.get_data(as_text=True) or ""
        try:
            body = json.loads(raw) if raw else {}
        except ValueError:
            body = {}
    channel = (body.get("channel") or request.args.get("channel") or NEWS_DEFAULT_CHANNEL).strip() or NEWS_DEFAULT_CHANNEL
    session_id = (body.get("session_id") or request.args.get("session_id") or "").strip()
    if not session_id:
        return jsonify({"error": "session_id required"}), 400
    news_channel.leave(channel, session_id, hangup_agent)
    return jsonify({"ok": True})


@app.route('/news/status', methods=['GET'])
def news_status():
    """Operator dump — which channels are running, how many viewers,
    what was last spoken. Handy for confirming the demo is alive."""
    return jsonify(news_channel.snapshot())


PHOTO_UPLOADS_DIR = os.environ.get("PHOTO_UPLOADS_DIR", "/home/ubuntu/web/uploads")
PHOTO_PUBLIC_BASE = os.environ.get("PHOTO_PUBLIC_BASE", "https://convoai-demo.agora.io/photo-uploads")
PHOTO_MAX_BYTES = int(os.environ.get("PHOTO_MAX_BYTES", str(15 * 1024 * 1024)))  # 15 MB
PHOTO_ALLOWED_MIMES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
PHOTO_DEFAULT_PROFILE = "PHOTO_GEMINI"
PHOTO_PROFILE_RE = re.compile(r"[^A-Za-z0-9_]+")


def _safe_profile(profile: str | None) -> str:
    """Sanitise a profile name for safe filesystem use. Default if missing."""
    candidate = PHOTO_PROFILE_RE.sub("", (profile or "")).upper()
    return candidate or PHOTO_DEFAULT_PROFILE


def _photo_dir(profile: str) -> str:
    """Per-profile upload subdirectory."""
    return os.path.join(PHOTO_UPLOADS_DIR, _safe_profile(profile))


def _photo_meta_path(photo_id: str, profile: str) -> str:
    return os.path.join(_photo_dir(profile), f"{photo_id}.json")


def _photo_image_path(photo_id: str, profile: str) -> str:
    return os.path.join(_photo_dir(profile), f"{photo_id}.jpg")


def _photo_public_url(photo_id: str, profile: str) -> str:
    return f"{PHOTO_PUBLIC_BASE.rstrip('/')}/{_safe_profile(profile)}/{photo_id}.jpg"


def _photo_payload(photo_id: str, profile: str) -> dict | None:
    try:
        with open(_photo_meta_path(photo_id, profile)) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


_DEFAULT_PHOTO_META_PATH = os.path.join(PHOTO_UPLOADS_DIR, "photo_default.json")


def _default_photo_meta() -> dict | None:
    """Curated 'starter' photo shown when a profile's gallery is empty.
    Lives at /home/ubuntu/web/uploads/photo_default.{jpg,json}."""
    try:
        with open(_DEFAULT_PHOTO_META_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


@app.route('/upload-photo', methods=['POST'])
def upload_photo():
    """Accept an image upload, run vision + crop, return metadata.

    Multipart form field: `photo` (required).
    Response: {id, image_url, sex, age_bucket, voice_id, uploaded_at}.
    """
    f = request.files.get("photo")
    if f is None:
        return jsonify({"error": "missing 'photo' file in multipart form"}), 400
    mime = (f.mimetype or "").lower()
    if mime not in PHOTO_ALLOWED_MIMES:
        return jsonify({"error": f"unsupported mime: {mime}"}), 415
    raw = f.read()
    if not raw:
        return jsonify({"error": "empty file"}), 400
    if len(raw) > PHOTO_MAX_BYTES:
        return jsonify({"error": f"file too large (> {PHOTO_MAX_BYTES} bytes)"}), 413

    profile = _safe_profile(request.args.get("profile") or request.form.get("profile"))
    profile_dir = _photo_dir(profile)
    os.makedirs(profile_dir, exist_ok=True)

    # Normalize EXIF orientation up-front so vision + crop see the same upright
    # pixels — otherwise the bbox returned by GPT-4o is for a sideways image.
    try:
        raw = normalize_orientation(raw)
    except Exception as exc:
        app.logger.warning("orientation normalize failed (proceeding with raw): %s", exc)

    try:
        analysis = analyse_image(raw, mime_type=mime)
    except Exception as exc:  # vision is best-effort, never block upload
        app.logger.warning("vision failed: %s", exc)
        analysis = {"sex": None, "age_bucket": None, "bbox": None}

    try:
        cropped = crop_for_avatar(raw, analysis.get("bbox"))
    except Exception as exc:
        app.logger.exception("crop failed: %s", exc)
        return jsonify({"error": "image processing failed"}), 500

    photo_id = uuid4().hex
    image_path = _photo_image_path(photo_id, profile)
    with open(image_path, "wb") as out:
        out.write(cropped)

    # Pick a vendor-appropriate voice for the resolved profile so the landing
    # app's Talk button passes the right ID, regardless of whether the profile
    # is in env or fell back. Default to Gemini's voice for unknown / MLLM
    # profiles; ElevenLabs only when the profile actually uses cascading TTS.
    voice_id_gemini = pick_gemini_voice(analysis.get("sex"))
    voice_id_elevenlabs = pick_voice(analysis.get("sex"), analysis.get("age_bucket"))
    profile_constants = initialize_constants(profile)
    is_mllm = (profile_constants.get("ENABLE_MLLM") or "").lower() == "true"
    mllm_vendor = (profile_constants.get("MLLM_VENDOR") or "").lower()
    if is_mllm and mllm_vendor == "gemini":
        primary_voice = voice_id_gemini
    elif is_mllm and mllm_vendor == "xai":
        primary_voice = profile_constants.get("MLLM_VOICE") or "eve"  # xAI doesn't have sex-mapped voices
    else:
        primary_voice = voice_id_elevenlabs

    image_url = _photo_public_url(photo_id, profile)
    payload = {
        "id": photo_id,
        "profile": profile,
        "image_url": image_url,
        "sex": analysis.get("sex"),
        "age_bucket": analysis.get("age_bucket"),
        "voice_id": primary_voice,
        "voice_id_elevenlabs": voice_id_elevenlabs,
        "voice_id_gemini": voice_id_gemini,
        "uploaded_at": int(time.time()),
    }
    with open(_photo_meta_path(photo_id, profile), "w") as out:
        json.dump(payload, out)

    # Atomic latest swap — scoped to this profile.
    latest_path = os.path.join(profile_dir, "latest.json")
    tmp_latest = latest_path + ".tmp"
    with open(tmp_latest, "w") as out:
        json.dump(payload, out)
    os.replace(tmp_latest, latest_path)
    # Also keep a copy as latest.jpg under the profile dir.
    latest_jpg = os.path.join(profile_dir, "latest.jpg")
    tmp_latest_jpg = latest_jpg + ".tmp"
    with open(tmp_latest_jpg, "wb") as out:
        out.write(cropped)
    os.replace(tmp_latest_jpg, latest_jpg)

    return jsonify(payload)


@app.route('/photo-latest', methods=['GET'])
def photo_latest():
    """Return metadata for the most-recent uploaded photo within ?profile=.
    Falls back to the curated photo_default if the profile has no uploads yet."""
    profile = _safe_profile(request.args.get("profile"))
    latest_path = os.path.join(_photo_dir(profile), "latest.json")
    try:
        with open(latest_path) as f:
            return jsonify(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    default = _default_photo_meta()
    if default:
        return jsonify({**default, "profile": profile})
    return jsonify({"id": None, "image_url": None, "voice_id": None, "profile": profile}), 200


@app.route('/photo/<photo_id>', methods=['GET'])
def photo_get(photo_id: str):
    """Return metadata for one specific upload within ?profile=.

    Special-case: photo_id == 'default' resolves to the curated seed at
    /uploads/photo_default.{jpg,json}. /photos always surfaces the seed
    as a "default" tile so users have a one-click "try me"; without
    this fallback, clicking that tile 404's on the singular endpoint.
    """
    if not photo_id.isalnum() or len(photo_id) > 64:
        abort(400)
    profile = _safe_profile(request.args.get("profile"))
    if photo_id == "default":
        seed = _default_photo_meta()
        if seed is None:
            abort(404)
        return jsonify({**seed, "profile": profile})
    data = _photo_payload(photo_id, profile)
    if data is None:
        abort(404)
    return jsonify(data)


@app.route('/photo/<photo_id>', methods=['DELETE'])
def photo_delete(photo_id: str):
    """Remove one upload (image + sidecar) from ?profile= storage."""
    if not photo_id.isalnum() or len(photo_id) > 64:
        abort(400)
    profile = _safe_profile(request.args.get("profile"))
    img_path = _photo_image_path(photo_id, profile)
    meta_path = _photo_meta_path(photo_id, profile)
    if not os.path.exists(meta_path) and not os.path.exists(img_path):
        abort(404)
    for path in (img_path, meta_path):
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
    return ('', 204)


@app.route('/photos', methods=['GET'])
def photos_list():
    """Return the N most recent uploads within ?profile=, newest first.

    The curated default (/uploads/photo_default.jpg) is always appended
    as a fallback tile so visitors have a one-click "try me" option
    without having to upload their own photo first. /photos only serves
    photo-avatar profiles by design, so this policy affects only them.
    """
    try:
        limit = max(1, min(50, int(request.args.get('limit', '12'))))
    except ValueError:
        limit = 12
    profile = _safe_profile(request.args.get("profile"))
    profile_dir = _photo_dir(profile)
    items = []
    try:
        for name in os.listdir(profile_dir):
            if not name.endswith('.json') or name == 'latest.json':
                continue
            path = os.path.join(profile_dir, name)
            try:
                with open(path) as f:
                    items.append(json.load(f))
            except (OSError, json.JSONDecodeError):
                continue
    except FileNotFoundError:
        pass
    items.sort(key=lambda m: m.get('uploaded_at') or 0, reverse=True)

    default = _default_photo_meta()
    if default:
        seed = {**default, "profile": profile}
        # Skip the seed if a real upload already carries the same id
        # (shouldn't happen — the curated default lives at
        # /uploads/photo_default.{jpg,json}, not inside any profile
        # dir — but this keeps the dedupe honest if someone renames).
        if not any(m.get("id") == seed.get("id") for m in items):
            # Reserve a slot for the default so it survives the
            # limit cut even when real uploads fill the grid.
            items = items[: max(0, limit - 1)] + [seed]
            return jsonify(items)
    return jsonify(items[:limit])


# ── Voice clone (Gradium) ─────────────────────────────────────────────
# Sidecars live at /uploads/<profile>/voices/<slug>.{json,wav}. Slug is
# the clone datetime "YYYY-MM-DD-HHMMSS" — human-readable label + naturally
# sortable filename. Symmetric with the /photos + /photo/<id> shape.
#
# POST /clone-voice   accepts multipart audio, calls the vendor's clone
#                     REST endpoint, writes the sidecar, returns it.
# GET  /voices        lists newest-first, same shape as /photos.
# GET  /voice/<slug>  returns one sidecar.
#
# Vendor-agnostic on the wire so ElevenLabs / Cartesia support drops in
# the same shape later.

_VOICE_ALLOWED_MIMES = {
    "audio/wav", "audio/wave", "audio/x-wav",
    "audio/mpeg", "audio/mp3",
    "audio/webm", "audio/ogg",
}
_VOICE_MAX_BYTES = 8 * 1024 * 1024  # 8MB — clone samples are seconds long


def _voices_dir(profile: str) -> str:
    return os.path.join(_photo_dir(profile), "voices")


def _gradium_clone(audio_bytes: bytes, filename: str, name: str,
                   api_key: str) -> tuple[str | None, str | None]:
    """POST to Gradium /api/voices/. Returns (voice_id, note).

    Gradium's create-voice API is multipart with `audio_file` + `name`.
    Auth is `x-api-key: <key>` — probed against the live API since the
    docs only give a Python SDK example. Bearer / api-key both 401.

    Response shape: {"uid": "<voice_id>" | null, "error": ..., "was_updated": bool}

    Notable quirk: the API returns an `error` field describing readiness
    ("Please wait a bit till the voice is ready to be used.") even on
    successful creation. Treat presence of `uid` as success — the `error`
    string is a note we surface to the caller so the UX can warn the
    user to wait a moment before starting the call.
    """
    import requests
    try:
        r = requests.post(
            "https://api.gradium.ai/api/voices/",
            headers={"x-api-key": api_key},
            files={"audio_file": (filename, audio_bytes)},
            data={"name": name},
            timeout=90,
        )
    except requests.RequestException as exc:
        return None, f"network: {exc}"
    if r.status_code >= 400:
        return None, f"HTTP {r.status_code}: {r.text[:400]}"
    try:
        payload = r.json()
    except ValueError:
        return None, f"non-JSON response: {r.text[:400]}"
    voice_id = payload.get("uid")
    if not voice_id:
        return None, payload.get("error") or "no uid in response"
    # Success — `error` here is an informational note ("wait a bit"),
    # not a failure, so pass it through as a note for the UI.
    return voice_id, payload.get("error")


@app.route('/clone-voice', methods=['POST'])
def clone_voice():
    """Clone a voice via the profile's TTS vendor from an uploaded audio sample.

    Query: profile=<P> (required), vendor=<gradium> (default gradium).
    Multipart body: `audio` — WAV/MP3/webm/ogg blob, ≤ 8 MB.

    Writes /uploads/<profile>/voices/<slug>.{wav,json} and returns the
    sidecar JSON. Slug = UTC datetime YYYY-MM-DD-HHMMSS.
    """
    profile = _safe_profile(request.args.get("profile"))
    vendor = (request.args.get("vendor") or "gradium").lower()
    audio = request.files.get("audio")
    if audio is None:
        return jsonify({"error": "missing 'audio' file in multipart form"}), 400
    mime = (audio.mimetype or "").lower()
    if mime not in _VOICE_ALLOWED_MIMES:
        return jsonify({"error": f"unsupported mime: {mime}"}), 415
    raw = audio.read()
    if not raw:
        return jsonify({"error": "empty file"}), 400
    if len(raw) > _VOICE_MAX_BYTES:
        return jsonify({"error": f"file too large (> {_VOICE_MAX_BYTES} bytes)"}), 413

    constants = initialize_constants(profile)
    tts_key = constants.get("TTS_KEY")
    if not tts_key:
        return jsonify({"error": f"profile {profile} has no TTS_KEY"}), 400

    # Pick an extension for both the vendor upload and the on-disk copy.
    ext_by_mime = {
        "audio/wav": ".wav", "audio/wave": ".wav", "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3", "audio/mp3": ".mp3",
        "audio/webm": ".webm", "audio/ogg": ".ogg",
    }
    ext = ext_by_mime.get(mime, ".wav")

    # Datetime slug (UTC) — collision on same-second retry gets a "-2" suffix.
    from datetime import datetime, timezone
    voices_dir = _voices_dir(profile)
    os.makedirs(voices_dir, exist_ok=True)
    now = datetime.now(timezone.utc)
    base_slug = now.strftime("%Y-%m-%d-%H%M%S")
    slug = base_slug
    n = 2
    while os.path.exists(os.path.join(voices_dir, f"{slug}.json")):
        slug = f"{base_slug}-{n}"
        n += 1

    # Vendor-specific clone call. `note` is a non-failure message from
    # the vendor (e.g. Gradium's "wait a bit till the voice is ready").
    display_name = f"{profile} {slug}"
    if vendor == "gradium":
        voice_id, note = _gradium_clone(raw, f"{slug}{ext}", display_name, tts_key)
    else:
        return jsonify({"error": f"unsupported vendor '{vendor}'"}), 400
    if not voice_id:
        app.logger.warning("clone failed for %s: %s", profile, note)
        return jsonify({"error": f"{vendor} clone failed: {note}"}), 502

    # Persist the sample WAV + sidecar
    sample_path = os.path.join(voices_dir, f"{slug}{ext}")
    with open(sample_path, "wb") as out:
        out.write(raw)
    sidecar = {
        "id": slug,
        "voice_id": voice_id,
        "vendor": vendor,
        "created_at": int(now.timestamp()),
        "created_at_iso": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sample_bytes": len(raw),
        "sample_mime": mime,
        "sample_url": f"/photo-uploads/{profile}/voices/{slug}{ext}",
    }
    if note:
        sidecar["note"] = note
    with open(os.path.join(voices_dir, f"{slug}.json"), "w") as out:
        json.dump(sidecar, out)
    return jsonify(sidecar)


@app.route('/voices', methods=['GET'])
def voices_list():
    """List the N most recent voice clones for ?profile=, newest first."""
    try:
        limit = max(1, min(50, int(request.args.get('limit', '12'))))
    except ValueError:
        limit = 12
    profile = _safe_profile(request.args.get("profile"))
    voices_dir = _voices_dir(profile)
    items = []
    try:
        for name in os.listdir(voices_dir):
            if not name.endswith('.json'):
                continue
            path = os.path.join(voices_dir, name)
            try:
                with open(path) as f:
                    items.append(json.load(f))
            except (OSError, json.JSONDecodeError):
                continue
    except FileNotFoundError:
        pass
    items.sort(key=lambda m: m.get('created_at') or 0, reverse=True)
    return jsonify(items[:limit])


@app.route('/voice/<slug>', methods=['GET'])
def voice_get(slug):
    """Return one voice sidecar by slug."""
    profile = _safe_profile(request.args.get("profile"))
    # Guard against ../ etc.
    if "/" in slug or "\\" in slug or slug.startswith("."):
        return jsonify({"error": "bad slug"}), 400
    path = os.path.join(_voices_dir(profile), f"{slug}.json")
    try:
        with open(path) as f:
            return jsonify(json.load(f))
    except FileNotFoundError:
        return jsonify({"error": "not found"}), 404
    except json.JSONDecodeError:
        return jsonify({"error": "sidecar corrupt"}), 500


@app.route('/voice/<slug>', methods=['DELETE'])
def voice_delete(slug):
    """Remove one clone (sidecar + sample) from ?profile= storage.

    Only the on-disk records are dropped. The cloned voice is NOT deleted
    from Gradium — their voice registry is billed on retention, but their
    delete API isn't part of this integration yet.
    """
    if "/" in slug or "\\" in slug or slug.startswith("."):
        abort(400)
    profile = _safe_profile(request.args.get("profile"))
    voices_dir = _voices_dir(profile)
    meta_path = os.path.join(voices_dir, f"{slug}.json")
    if not os.path.exists(meta_path):
        abort(404)
    # Sidecar tells us which sample extension to nuke — we support .wav /
    # .mp3 / .webm / .ogg. Fall back to a glob if the sidecar is unreadable.
    sample_paths = []
    try:
        with open(meta_path) as f:
            sidecar = json.load(f)
        url = sidecar.get("sample_url") or ""
        ext = os.path.splitext(url)[1] or ".wav"
        sample_paths.append(os.path.join(voices_dir, f"{slug}{ext}"))
    except (OSError, json.JSONDecodeError):
        for ext in (".wav", ".mp3", ".webm", ".ogg"):
            sample_paths.append(os.path.join(voices_dir, f"{slug}{ext}"))
    for path in (*sample_paths, meta_path):
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
    return ('', 204)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "service": "agora-convoai-backend"})


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 8082))
    debug_enabled = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    use_reloader = os.environ.get('FLASK_USE_RELOADER', 'false').lower() == 'true'
    print("=" * 60)
    print("Agora ConvoAI Local Server")
    print("=" * 60)
    print(f"Starting Flask server on http://0.0.0.0:{port}")
    print("\nEndpoints:")
    print("  GET  /start-agent?channel=test")
    print("  GET  /hangup-agent?agent_id=xxx")
    print("  POST /speak  {agent_id, text, priority}")
    print("  GET  /health")
    print("\nPress CTRL+C to stop")
    print("=" * 60)
    app.run(host='0.0.0.0', port=port, debug=debug_enabled, use_reloader=use_reloader)
