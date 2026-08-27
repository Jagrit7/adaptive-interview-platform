"""
Optional consultant-dashboard integration for simple-backend.

When REQUIRE_CONSULTANT_DASHBOARD_CLIENT=false, this module is additive and fail-open.
When REQUIRE_CONSULTANT_DASHBOARD_CLIENT=true, matching a dashboard client becomes
part of authorization for that profile.
"""

import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from core.auth import _load_user_profile
from core.signing import build_signature_headers

ACCOUNT_NOT_FOUND_ERROR = 'Account not found. Please contact your consultant.'
DASHBOARD_UNAVAILABLE_ERROR = 'Dashboard authorization is temporarily unavailable. Please try again.'
MAX_RECENT_SUMMARIES = 3
MAX_RECENT_SUMMARY_CHARS = 280


def _hash(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def _is_truthy(value):
    return str(value or '').strip().lower() in {'1', 'true', 'yes', 'on'}


def _dashboard_enabled(constants):
    return bool(
        constants.get('CONSULTANT_DASHBOARD_URL')
        and constants.get('CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET')
    )


def dashboard_client_required(constants):
    return _dashboard_enabled(constants) and _is_truthy(
        constants.get('REQUIRE_CONSULTANT_DASHBOARD_CLIENT')
    )


def _signed_get_json(base_url, path, query_params, shared_secret, timeout_seconds):
    query = urllib.parse.urlencode(query_params)
    headers = build_signature_headers(shared_secret, 'GET', path, query)
    url = urllib.parse.urljoin(base_url.rstrip('/') + '/', path.lstrip('/'))
    if query:
        url = f"{url}?{query}"
    req = urllib.request.Request(url, headers=headers, method='GET')
    with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))


def _signed_post_json(base_url, path, payload, shared_secret, timeout_seconds):
    body = json.dumps(payload, separators=(',', ':'))
    headers = build_signature_headers(shared_secret, 'POST', path, body)
    headers['Content-Type'] = 'application/json'
    url = urllib.parse.urljoin(base_url.rstrip('/') + '/', path.lstrip('/'))
    req = urllib.request.Request(url, data=body.encode('utf-8'), headers=headers, method='POST')
    with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))


def _build_identity_query(profile_data):
    query = {}
    vendor_slug = ((profile_data or {}).get('vendor_slug', '') or '').strip().lower()
    google_sub = (profile_data or {}).get('google_sub', '')
    email = ((profile_data or {}).get('email', '') or '').strip().lower()
    if vendor_slug:
        query['vendor_slug'] = vendor_slug
    if email:
        query['email_hash'] = _hash(email)
    if profile_data.get('phone_hash'):
        query['phone_hash'] = profile_data['phone_hash']
    if google_sub:
        query['google_sub_hash'] = _hash(google_sub)
    if profile_data.get('name_hash'):
        query['normalized_name_hash'] = profile_data['name_hash']
    return query


def _load_resolution_profile(constants, user_id_hash=None, profile_data=None):
    if profile_data:
        return profile_data
    if not user_id_hash or user_id_hash == 'anonymous':
        return None
    return _load_user_profile(constants, user_id_hash)


def resolve_dashboard_client(
    constants,
    user_id_hash=None,
    profile_data=None,
    include_context=False,
    allow_email_only=False,
):
    if not _dashboard_enabled(constants):
        return {'status': 'disabled', 'error': 'Consultant dashboard integration is not configured.'}

    profile_data = _load_resolution_profile(constants, user_id_hash=user_id_hash, profile_data=profile_data)
    if not profile_data:
        return {'status': 'missing_identity', 'error': 'No stored identity was found for dashboard authorization.'}

    query = _build_identity_query(profile_data)
    if not query.get('email_hash'):
        return {'status': 'missing_identity', 'error': ACCOUNT_NOT_FOUND_ERROR}
    if not query.get('phone_hash') and not allow_email_only:
        return {'status': 'missing_identity', 'error': ACCOUNT_NOT_FOUND_ERROR}

    base_url = constants['CONSULTANT_DASHBOARD_URL']
    shared_secret = constants['CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET']
    timeout_seconds = int(constants.get('CONSULTANT_DASHBOARD_TIMEOUT_SECONDS') or 5)

    try:
        status, resolve_data = _signed_get_json(
            base_url,
            '/internal/resolve-client',
            query,
            shared_secret,
            timeout_seconds,
        )
        if status != 200 or not resolve_data.get('found'):
            return {'status': 'not_found', 'error': ACCOUNT_NOT_FOUND_ERROR}

        result = {
            'status': 'resolved',
            'client_id': resolve_data.get('client_id', ''),
            'consultant_id': resolve_data.get('consultant_id', ''),
            'vendor_slug': resolve_data.get('vendor_slug', ''),
            'email': resolve_data.get('email', ''),
            'first_name': resolve_data.get('first_name', ''),
            'last_name': resolve_data.get('last_name', ''),
            'display_name': resolve_data.get('display_name', ''),
            'phone_number': resolve_data.get('phone_number', ''),
        }

        if include_context:
            client_id = result['client_id']
            context_status, context_data = _signed_get_json(
                base_url,
                '/internal/client-context',
                {'client_id': client_id},
                shared_secret,
                timeout_seconds,
            )
            if context_status != 200:
                return {'status': 'lookup_failed', 'error': DASHBOARD_UNAVAILABLE_ERROR}

            result.update({
                'consultant_name': context_data.get('consultant_name', ''),
                'context': context_data,
                'prompt_addition': build_prompt_addition(context_data),
            })

        return result
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return {'status': 'not_found', 'error': ACCOUNT_NOT_FOUND_ERROR}
        print(f"[ConsultantDashboard] Dashboard authorization failed: {exc.code} {exc.reason}")
        return {'status': 'lookup_failed', 'error': DASHBOARD_UNAVAILABLE_ERROR}
    except Exception as exc:
        print(f"[ConsultantDashboard] Dashboard authorization failed: {exc}")
        return {'status': 'lookup_failed', 'error': DASHBOARD_UNAVAILABLE_ERROR}


def build_prompt_addition(client_context):
    if not client_context:
        return ''

    lines = [
        'CONSULTANT DASHBOARD CONTEXT:',
        '- Use this context naturally when helpful, but do not mention a dashboard or internal system.',
        '- Prioritize the current conversation if it conflicts with older context.',
    ]

    notes = (client_context.get('notes') or '').strip()
    if notes:
        lines.append(f"- Background notes: {notes}")

    direction = (client_context.get('direction') or '').strip()
    if direction:
        lines.append(f"- Session direction: {direction}")

    latest_summary = client_context.get('latest_summary') or {}
    if isinstance(latest_summary, dict):
        overview = (
            latest_summary.get('brief_overview')
            or latest_summary.get('overview')
            or latest_summary.get('summary')
            or ''
        ).strip()
        full_summary = (latest_summary.get('full_summary') or '').strip()
        biomarker_summary = (latest_summary.get('biomarker_summary') or '').strip()
        if overview:
            lines.append(f"- Previous session summary: {overview}")
        if full_summary:
            lines.append(f"- Previous session full summary: {full_summary}")
        if biomarker_summary:
            lines.append(f"- Previous biomarker summary: {biomarker_summary}")

    recent_summaries = client_context.get('recent_summaries') or []
    if recent_summaries:
        lines.append('- Recent full session summaries:')
        for summary in recent_summaries[:MAX_RECENT_SUMMARIES]:
            full_summary = (summary.get('full_summary') or '').strip()
            ended_at = summary.get('ended_at') or 'recent session'
            if full_summary:
                if len(full_summary) > MAX_RECENT_SUMMARY_CHARS:
                    full_summary = full_summary[: MAX_RECENT_SUMMARY_CHARS - 1].rstrip() + '…'
                lines.append(f"  * {ended_at}: {full_summary}")

    baseline = client_context.get('baseline') or {}
    averages = baseline.get('averages') or {}
    if averages:
        avg_parts = [f"{key}={value}" for key, value in sorted(averages.items())]
        lines.append(f"- Biomarker baseline: {', '.join(avg_parts)}")

    alerts = client_context.get('alerts') or []
    if alerts:
        alert_parts = []
        for alert in alerts[:3]:
            severity = alert.get('severity', 'info')
            title = alert.get('title', 'Alert')
            alert_parts.append(f"{severity}: {title}")
        lines.append(f"- Open alerts: {'; '.join(alert_parts)}")

    return '\n'.join(lines)


def fetch_dashboard_context(constants, user_id_hash):
    result = resolve_dashboard_client(constants, user_id_hash=user_id_hash, include_context=True)
    if result.get('status') != 'resolved':
        if user_id_hash and user_id_hash != 'anonymous':
            print(f"[ConsultantDashboard] {result.get('error')} user_id={user_id_hash[:8]}...")
        return result
    print(
        f"[ConsultantDashboard] Resolved client_id={result.get('client_id')} "
        f"consultant_id={result.get('consultant_id') or 'none'}"
    )
    return result


def fetch_dashboard_meeting_signals(constants, meeting_id):
    if not _dashboard_enabled(constants) or not meeting_id:
        return {"status": "disabled"}

    base_url = constants["CONSULTANT_DASHBOARD_URL"]
    shared_secret = constants["CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET"]
    timeout_seconds = int(constants.get("CONSULTANT_DASHBOARD_TIMEOUT_SECONDS") or 5)

    try:
        status, signal_data = _signed_get_json(
            base_url,
            "/internal/meeting-signals",
            {"meeting_id": meeting_id},
            shared_secret,
            timeout_seconds,
        )
        if status != 200 or not signal_data.get("ok"):
            return {"status": "not_found", "error": "Meeting settings were not found."}
        return {
            "status": "resolved",
            "meeting_id": signal_data.get("meeting_id", ""),
            "meeting_type": signal_data.get("meeting_type", ""),
            "transcription_enabled": bool(signal_data.get("transcription_enabled")),
            "audio_biomarkers_enabled": bool(signal_data.get("audio_biomarkers_enabled", True)),
            "video_biomarkers_enabled": bool(signal_data.get("video_biomarkers_enabled", True)),
        }
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return {"status": "not_found", "error": "Meeting settings were not found."}
        print(f"[ConsultantDashboard] Meeting signal lookup failed: {exc.code} {exc.reason}")
        return {"status": "lookup_failed", "error": DASHBOARD_UNAVAILABLE_ERROR}
    except Exception as exc:
        print(f"[ConsultantDashboard] Meeting signal lookup failed: {exc}")
        return {"status": "lookup_failed", "error": DASHBOARD_UNAVAILABLE_ERROR}


def verify_dashboard_client_password(constants, email, password):
    if not _dashboard_enabled(constants):
        return {'status': 'disabled', 'error': 'Consultant dashboard integration is not configured.'}

    base_url = constants['CONSULTANT_DASHBOARD_URL']
    shared_secret = constants['CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET']
    timeout_seconds = int(constants.get('CONSULTANT_DASHBOARD_TIMEOUT_SECONDS') or 5)

    try:
        # This endpoint receives the raw password for verification, so the internal dashboard URL
        # must stay on localhost or HTTPS-protected infrastructure outside local development.
        status, data = _signed_post_json(
            base_url,
            '/internal/verify-client-password',
            {
                'email': (email or '').strip().lower(),
                'password': password or '',
                'vendor_slug': (constants.get('VENDOR_SLUG') or '').strip().lower(),
            },
            shared_secret,
            timeout_seconds,
        )
        if status != 200 or not data.get('ok'):
            return {'status': 'invalid_credentials', 'error': 'Invalid email or password.'}
        return {
            'status': 'verified',
            'client_id': data.get('client_id', ''),
            'consultant_id': data.get('consultant_id', ''),
            'vendor_slug': data.get('vendor_slug', ''),
            'first_name': data.get('first_name', ''),
            'last_name': data.get('last_name', ''),
            'display_name': data.get('display_name', ''),
            'email': data.get('email', ''),
            'phone_number': data.get('phone_number', ''),
        }
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return {'status': 'invalid_credentials', 'error': 'Invalid email or password.'}
        if exc.code == 403:
            try:
                payload = json.loads(exc.read().decode('utf-8'))
            except Exception:
                payload = {}
            if payload.get('error') == 'password_login_not_enabled':
                return {'status': 'password_login_not_enabled', 'error': 'Password login is not enabled for this account.'}
        return {'status': 'lookup_failed', 'error': f'Client password verification failed: {exc.code} {exc.reason}'}
    except Exception as exc:
        print(f"[ConsultantDashboard] Client password verification failed: {exc}")
        return {'status': 'lookup_failed', 'error': 'Password verification is temporarily unavailable. Please try again.'}
