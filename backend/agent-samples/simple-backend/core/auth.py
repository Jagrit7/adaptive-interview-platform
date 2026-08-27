"""
Optional authentication blueprint for Agora ConvoAI.

When AUTH_JWT_SECRET is set for a profile, this blueprint provides:
- Google OAuth login
- Twilio SMS 2FA
- JWT token minting
- User profile storage (encrypted on disk)

When AUTH_JWT_SECRET is not set, all auth is skipped — get_authenticated_user_id()
returns "anonymous" and the system works exactly as before.
"""

import os
import json
import base64
import hmac
import hashlib
import time
import urllib.parse
from pathlib import Path
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, redirect, session, render_template, make_response
from core.phone_numbers import country_options, normalize_phone as normalize_supported_phone

auth_bp = Blueprint('auth', __name__)
AUTH_COOKIE_NAME = "mindfix_client_auth"
AUTH_COOKIE_MAX_AGE_SECONDS = 3600

# Dev mode: skip Google OAuth and Twilio SMS for local testing.
# Set AUTH_DEV_MODE=true in .env. PIN is always 000000.
AUTH_DEV_MODE = os.environ.get('AUTH_DEV_MODE', '').lower() == 'true'


# ─── Helpers ───

def _get_profile_constants():
    """Load constants for the profile stored in Flask session."""
    from core.config import initialize_constants
    profile = session.get('auth_profile')
    if profile:
        profile = profile.lower()
    constants = initialize_constants(profile)
    vendor_slug = _current_vendor_slug()
    if vendor_slug:
        constants['VENDOR_SLUG'] = vendor_slug
    return constants


def _peek_signed_payload(token):
    try:
        encoded, _sig = token.split('.', 1)
        padded = encoded + '=' * (-len(encoded) % 4)
        return json.loads(base64.urlsafe_b64decode(padded.encode('ascii')).decode('utf-8'))
    except Exception:
        return None


def _verify_signed_payload(token, secret, expected_purpose):
    if not token or not secret:
        return None
    try:
        encoded, supplied_signature = token.split('.', 1)
    except ValueError:
        return None
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        encoded.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, supplied_signature):
        return None
    payload = _peek_signed_payload(token)
    if not payload or payload.get('purpose') != expected_purpose:
        return None
    if int(payload.get('exp') or 0) < int(time.time()):
        return None
    return payload


def _sign_signed_payload(payload, secret):
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(',', ':'), sort_keys=True).encode('utf-8')
    ).decode('ascii').rstrip('=')
    signature = hmac.new(
        secret.encode('utf-8'),
        encoded.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()
    return f"{encoded}.{signature}"


def _current_vendor_slug():
    environ_slug = ((request.environ.get('mindfix.vendor_slug') or '') if request else '').strip().lower()
    if environ_slug:
        return environ_slug
    return (session.get('auth_vendor_slug') or '').strip().lower()


def _tenant_path(path):
    vendor_slug = _current_vendor_slug()
    if not vendor_slug:
        return path
    return f"/v/{vendor_slug}{path}"


def _get_brand_name(constants):
    return (constants.get('AUTH_BRAND_NAME') or 'your session').strip()


def _get_brand_theme(constants):
    vendor_slug = (_current_vendor_slug() or constants.get('VENDOR_SLUG') or 'mindfix').strip().lower()
    brand_path = (
        Path(__file__).resolve().parents[3]
        / 'consultant_dashboard'
        / 'www'
        / vendor_slug
        / 'brand.json'
    )
    fallback = {
        'wordmark': _get_brand_name(constants),
        'icon_class': 'fa-solid fa-brain',
        'logo_url': '',
        'accent': '#1f7a52',
        'text_main': '#132218',
        'text_muted': '#5a7261',
        'bg_start': '#f4f7f2',
        'bg_end': '#eef5ef',
        'topbar_bg': '#1b2838',
        'topbar_text': '#ffffff',
        'topbar_mark': '#2bb58e',
    }
    try:
        if brand_path.exists():
            loaded = json.loads(brand_path.read_text(encoding='utf-8'))
            fallback.update({
                key: value
                for key, value in loaded.items()
                if key in fallback and isinstance(value, str) and value.strip()
            })
    except Exception:
        pass
    return fallback


def _get_auth_token_from_request(req):
    auth_header = req.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    return req.cookies.get(AUTH_COOKIE_NAME, '')


def _decode_auth_token(token, jwt_secret):
    if not token or not jwt_secret:
        return None
    try:
        import jwt
        return jwt.decode(token, jwt_secret, algorithms=['HS256'])
    except Exception:
        return None


def _hash(value):
    """SHA-256 hash a string."""
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def _normalize_name(name):
    """Normalize a name for hashing: lowercase, strip, collapse whitespace."""
    import re
    return re.sub(r'\s+', ' ', name.strip().lower())


def _client_user_id_hash(client_id):
    return _hash(f'client|{client_id}')


def _save_dashboard_profile(constants, client_id, email, display_name, phone_number, google_sub='', first_name=''):
    normalized_phone = phone_number.strip()
    normalized_name = _normalize_name(display_name or '')
    profile_data = {
        'client_id': client_id,
        'google_sub': google_sub,
        'email': (email or '').strip().lower(),
        'vendor_slug': (constants.get('VENDOR_SLUG') or '').strip().lower(),
        'first_name': (first_name or '').strip(),
        'name_hash': _hash(normalized_name) if normalized_name else '',
        'phone_hash': _hash(normalized_phone) if normalized_phone else '',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'last_login': datetime.now(timezone.utc).isoformat(),
    }
    user_id_hash = _client_user_id_hash(client_id)
    existing = _load_user_profile(constants, user_id_hash) or {}
    existing.update({k: v for k, v in profile_data.items() if v})
    existing['last_login'] = datetime.now(timezone.utc).isoformat()
    if 'created_at' not in existing:
        existing['created_at'] = profile_data['created_at']
    _save_user_profile(constants, user_id_hash, existing)
    return user_id_hash


def _begin_dashboard_sms_auth(constants, dashboard_result, email="", google_sub=""):
    phone_number = (dashboard_result.get('phone_number') or '').strip()
    if not phone_number:
        return None, 'This account is missing a 2FA phone number. Please contact your consultant.'

    user_id_hash = _save_dashboard_profile(
        constants,
        dashboard_result.get('client_id', ''),
        dashboard_result.get('email', email).strip().lower(),
        dashboard_result.get('display_name', ''),
        phone_number,
        google_sub=google_sub,
        first_name=dashboard_result.get('first_name', ''),
    )
    session['auth_name'] = dashboard_result.get('display_name', '')
    session['auth_first_name'] = (dashboard_result.get('first_name') or '').strip()
    session['auth_email'] = dashboard_result.get('email', email).strip().lower()
    session['auth_phone'] = phone_number
    session['auth_user_id_hash'] = user_id_hash
    session['auth_client_id'] = dashboard_result.get('client_id', '')
    session['auth_via_password'] = not bool(google_sub)

    send_error = _send_verification_code(constants, phone_number)
    if send_error:
        return None, send_error
    return _tenant_path('/auth/verify'), None


def _send_verification_code(constants, normalized_phone):
    if AUTH_DEV_MODE:
        print(f'[Auth] DEV MODE: skipping Twilio SMS to {normalized_phone}, use PIN 000000')
        return None

    twilio_sid = constants.get('TWILIO_ACCOUNT_SID')
    twilio_token = constants.get('TWILIO_AUTH_TOKEN')
    verify_sid = constants.get('TWILIO_VERIFY_SERVICE_SID')

    if not all([twilio_sid, twilio_token, verify_sid]):
        return 'SMS verification not configured.'

    try:
        from twilio.rest import Client
        client = Client(twilio_sid, twilio_token)
        client.verify.v2.services(verify_sid).verifications.create(
            to=normalized_phone,
            channel='sms'
        )
        return None
    except Exception as e:
        print(f"[Auth] Twilio send failed: {e}")
        return 'Failed to send verification code.'


def _get_data_dir(constants):
    """Get the data directory for user profiles."""
    return constants.get('AUTH_DATA_DIR') or './data'


def _get_user_dir(constants, user_id_hash):
    """Get the directory for a specific user."""
    return os.path.join(_get_data_dir(constants), 'users', user_id_hash)


def _encrypt_json(data, encryption_key, user_id_hash):
    """Encrypt a dict as JSON using AES-256-GCM with HKDF-derived key."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes

    master_key = bytes.fromhex(encryption_key)
    salt = os.urandom(16)

    # Derive per-user key via HKDF
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=user_id_hash.encode('utf-8'),
    )
    derived_key = hkdf.derive(master_key)

    nonce = os.urandom(12)
    aesgcm = AESGCM(derived_key)
    plaintext = json.dumps(data).encode('utf-8')
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)

    # Format: salt(16) + nonce(12) + ciphertext
    return salt + nonce + ciphertext


def _decrypt_json(encrypted_bytes, encryption_key, user_id_hash):
    """Decrypt AES-256-GCM encrypted JSON."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes

    master_key = bytes.fromhex(encryption_key)
    salt = encrypted_bytes[:16]
    nonce = encrypted_bytes[16:28]
    ciphertext = encrypted_bytes[28:]

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=user_id_hash.encode('utf-8'),
    )
    derived_key = hkdf.derive(master_key)

    aesgcm = AESGCM(derived_key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return json.loads(plaintext.decode('utf-8'))


def _load_user_profile(constants, user_id_hash):
    """Load an encrypted user profile from disk. Returns dict or None."""
    encryption_key = constants.get('ENCRYPTION_KEY')
    if not encryption_key:
        return None
    profile_path = os.path.join(_get_user_dir(constants, user_id_hash), 'profile.enc')
    if not os.path.exists(profile_path):
        return None
    try:
        with open(profile_path, 'rb') as f:
            encrypted = f.read()
        return _decrypt_json(encrypted, encryption_key, user_id_hash)
    except Exception as e:
        print(f"[Auth] Failed to load user profile: {e}")
        return None


def _save_user_profile(constants, user_id_hash, profile_data):
    """Save an encrypted user profile to disk."""
    encryption_key = constants.get('ENCRYPTION_KEY')
    if not encryption_key:
        return
    user_dir = _get_user_dir(constants, user_id_hash)
    os.makedirs(user_dir, exist_ok=True)
    sessions_dir = os.path.join(user_dir, 'sessions')
    os.makedirs(sessions_dir, exist_ok=True)
    profile_path = os.path.join(user_dir, 'profile.enc')
    encrypted = _encrypt_json(profile_data, encryption_key, user_id_hash)
    with open(profile_path, 'wb') as f:
        f.write(encrypted)


def _validate_return_url(return_url, constants):
    """Validate return URL against allowed origins to prevent open redirect."""
    if not return_url:
        return False
    allowed = constants.get('ALLOWED_RETURN_ORIGINS', '')
    if not allowed:
        return True  # No restriction configured
    allowed_origins = [o.strip() for o in allowed.split(',') if o.strip()]
    parsed = urllib.parse.urlparse(return_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    return origin in allowed_origins


# ─── Public helper (imported by local_server.py) ───

def get_authenticated_user_id(req, constants):
    """
    Returns (user_id, user_name, error_string).
    user_id is 'anonymous' when auth is not configured for this profile.
    """
    jwt_secret = constants.get('AUTH_JWT_SECRET')
    if not jwt_secret:
        return 'anonymous', '', None

    token = _get_auth_token_from_request(req)
    if not token:
        return None, '', 'Authentication required'

    claims = _decode_auth_token(token, jwt_secret)
    if claims:
        return claims['user_id'], claims.get('first_name') or claims.get('name', ''), None
    return None, '', 'Invalid or expired session'


# ─── Routes ───

@auth_bp.route('/auth-check', methods=['GET'])
def auth_check():
    """Check if auth is required for this profile and if the current token is valid."""
    from core.config import initialize_constants

    profile = request.args.get('profile', '')
    if profile:
        profile = profile.lower()
    constants = initialize_constants(profile)
    vendor_slug = _current_vendor_slug()
    if vendor_slug:
        constants['VENDOR_SLUG'] = vendor_slug

    jwt_secret = constants.get('AUTH_JWT_SECRET')
    if not jwt_secret:
        return jsonify({
            'auth_required': False,
            'authenticated': False,
            'vendor_slug': vendor_slug or (constants.get('VENDOR_SLUG') or 'mindfix').strip().lower(),
        })

    # Auth is required — check for valid Bearer token
    claims = _decode_auth_token(_get_auth_token_from_request(request), jwt_secret)
    if claims:
        from core.consultant_dashboard import dashboard_client_required, resolve_dashboard_client

        if dashboard_client_required(constants):
            dashboard_result = resolve_dashboard_client(constants, user_id_hash=claims.get('user_id'))
            if dashboard_result.get('status') != 'resolved':
                return jsonify({
                    'auth_required': True,
                    'authenticated': False,
                    'auth_url': '',
                    'error': dashboard_result.get('error', 'Account not found. Please contact your consultant.'),
                }), 403
        return jsonify({
            'auth_required': True,
            'authenticated': True,
            'user_name': claims.get('first_name') or claims.get('name', ''),
            'vendor_slug': vendor_slug or (constants.get('VENDOR_SLUG') or 'mindfix').strip().lower(),
        })

    # Not authenticated — provide auth URL
    return_url = request.args.get('return_url', '')
    auth_url = (
        f"{_tenant_path('/auth/login')}?profile={urllib.parse.quote(profile)}"
        f"&return={urllib.parse.quote(return_url)}"
    )
    return jsonify({
        'auth_required': True,
        'authenticated': False,
        'auth_url': auth_url,
        'vendor_slug': vendor_slug or (constants.get('VENDOR_SLUG') or 'mindfix').strip().lower(),
    })


@auth_bp.route('/auth/login', methods=['GET'])
def auth_login():
    """Store profile and return URL in session, serve auth entry page."""
    profile = request.args.get('profile', '')
    return_url = request.args.get('return', '')
    force_reauth = request.args.get('reauth', '').strip() == '1'

    session['auth_profile'] = profile
    session['auth_return_url'] = return_url
    session['auth_vendor_slug'] = _current_vendor_slug() or (request.args.get('vendor') or '').strip().lower()
    constants = _get_profile_constants()

    existing_claims = _decode_auth_token(_get_auth_token_from_request(request), constants.get('AUTH_JWT_SECRET'))
    if existing_claims and not force_reauth and _validate_return_url(return_url, constants):
        return redirect(return_url)

    show_password_login = bool(constants.get('CONSULTANT_DASHBOARD_URL'))
    show_google_login = bool(constants.get('GOOGLE_CLIENT_ID')) or AUTH_DEV_MODE
    response = make_response(render_template(
        'auth/login.html',
        brand_name=_get_brand_name(constants),
        brand_theme=_get_brand_theme(constants),
        show_password_login=show_password_login,
        show_google_login=show_google_login,
    ))
    if force_reauth:
        response.delete_cookie(AUTH_COOKIE_NAME, path='/')
    return response


@auth_bp.route('/auth/password-login', methods=['POST'])
def auth_password_login():
    """Authenticate a dashboard-backed client by email/password, then send SMS."""
    constants = _get_profile_constants()
    email = request.form.get('email', '').strip().lower()
    password = request.form.get('password', '')
    if not email or not password:
        return jsonify({'error': 'Email and password are required.'}), 400

    from core.consultant_dashboard import verify_dashboard_client_password

    dashboard_result = verify_dashboard_client_password(constants, email, password)
    if dashboard_result.get('status') != 'verified':
        return jsonify({'error': dashboard_result.get('error', 'Invalid email or password.')}), 403

    redirect_url, send_error = _begin_dashboard_sms_auth(constants, dashboard_result, email=email)
    if send_error:
        status_code = 403 if '2FA phone number' in send_error else 500
        return jsonify({'error': send_error}), status_code
    return jsonify({'success': True, 'redirect': redirect_url})


@auth_bp.route('/auth/google', methods=['GET'])
def auth_google():
    """Redirect to Google OAuth consent screen."""
    if AUTH_DEV_MODE:
        # Dev mode: skip Google OAuth, use fake identity
        session['google_sub'] = 'dev-user-12345'
        session['google_email'] = 'dev@localhost'
        session['google_name'] = ''
        print('[Auth] DEV MODE: skipping Google OAuth, using fake identity')
        from core.consultant_dashboard import dashboard_client_required, resolve_dashboard_client
        if dashboard_client_required(_get_profile_constants()):
            constants = _get_profile_constants()
            dashboard_result = resolve_dashboard_client(
                constants,
                profile_data={
                    'google_sub': session['google_sub'],
                    'email': session['google_email'],
                },
                allow_email_only=True,
            )
            if dashboard_result.get('status') == 'resolved':
                redirect_url, send_error = _begin_dashboard_sms_auth(
                    constants,
                    dashboard_result,
                    email=session['google_email'],
                    google_sub=session['google_sub'],
                )
                if not send_error:
                    return redirect(redirect_url)
        return redirect(_tenant_path('/auth/identity'))

    constants = _get_profile_constants()
    client_id = constants.get('GOOGLE_CLIENT_ID')
    if not client_id:
        return 'Google OAuth not configured for this profile', 500

    # Build Google OAuth URL
    callback_url = request.url_root.rstrip('/') + '/auth/google/callback'
    params = urllib.parse.urlencode({
        'client_id': client_id,
        'redirect_uri': callback_url,
        'response_type': 'code',
        'scope': 'openid email profile',
        'access_type': 'offline',
        'prompt': 'select_account',
    })
    return redirect(f'https://accounts.google.com/o/oauth2/v2/auth?{params}')


@auth_bp.route('/auth/google/callback', methods=['GET'])
def auth_google_callback():
    """Handle Google OAuth callback — exchange code for user info."""
    code = request.args.get('code')
    if not code:
        return 'Missing authorization code', 400
    from core.config import initialize_constants
    state = request.args.get('state', '').strip()
    consultant_state = None
    if state:
        peeked_state = _peek_signed_payload(state) or {}
        state_profile = (peeked_state.get('profile') or 'therapy').strip().lower() or 'therapy'
        state_constants = initialize_constants(state_profile)
        consultant_state = _verify_signed_payload(
            state,
            state_constants.get('CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET', ''),
            'consultant_google_state',
        )
        if consultant_state:
            constants = state_constants
        else:
            constants = _get_profile_constants()
    else:
        constants = _get_profile_constants()
    client_id = constants.get('GOOGLE_CLIENT_ID')
    client_secret = constants.get('GOOGLE_CLIENT_SECRET')
    callback_url = request.url_root.rstrip('/') + '/auth/google/callback'

    # Exchange code for tokens
    import urllib.request
    token_data = urllib.parse.urlencode({
        'code': code,
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_uri': callback_url,
        'grant_type': 'authorization_code',
    }).encode('utf-8')

    try:
        token_req = urllib.request.Request(
            'https://oauth2.googleapis.com/token',
            data=token_data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
        )
        with urllib.request.urlopen(token_req, timeout=10) as resp:
            token_resp = json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f"[Auth] Google token exchange failed: {e}")
        return 'Authentication failed', 500

    # Get user info from ID token
    id_token = token_resp.get('id_token')
    if not id_token:
        return 'No ID token received', 500

    # Decode ID token (we trust Google's response since we just exchanged the code)
    import base64
    payload_b64 = id_token.split('.')[1]
    # Add padding
    payload_b64 += '=' * (4 - len(payload_b64) % 4)
    id_claims = json.loads(base64.urlsafe_b64decode(payload_b64))

    session['google_sub'] = id_claims.get('sub')
    session['google_email'] = id_claims.get('email', '')
    session['google_name'] = id_claims.get('name', '')

    if consultant_state:
        dashboard_secret = constants.get('CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET', '')
        complete_url = consultant_state.get('complete_url', '')
        vendor_slug = (consultant_state.get('vendor_slug') or '').strip().lower()
        if not dashboard_secret or not complete_url:
            return 'Consultant dashboard handoff is not configured', 500
        consultant_token = _sign_signed_payload(
            {
                'purpose': 'consultant_google_complete',
                'email': session['google_email'],
                'vendor_slug': vendor_slug,
                'exp': int(time.time()) + 300,
            },
            dashboard_secret,
        )
        separator = '&' if '?' in complete_url else '?'
        return redirect(f"{complete_url}{separator}consultant_token={urllib.parse.quote(consultant_token)}")

    from core.consultant_dashboard import dashboard_client_required, resolve_dashboard_client

    if dashboard_client_required(constants):
        dashboard_result = resolve_dashboard_client(
            constants,
            profile_data={
                'google_sub': session['google_sub'],
                'email': session['google_email'],
                'vendor_slug': _current_vendor_slug(),
            },
            allow_email_only=True,
        )
        if dashboard_result.get('status') != 'resolved':
            return dashboard_result.get('error', 'Account not found. Please contact your consultant.'), 403

        redirect_url, send_error = _begin_dashboard_sms_auth(
            constants,
            dashboard_result,
            email=session['google_email'],
            google_sub=session['google_sub'],
        )
        if send_error:
            status_code = 403 if '2FA phone number' in send_error else 500
            return send_error, status_code
        return redirect(redirect_url)

    return redirect(_tenant_path('/auth/identity'))


@auth_bp.route('/auth/identity', methods=['GET'])
def auth_identity():
    """Serve name and phone form."""
    if not session.get('google_sub'):
        return redirect(_tenant_path('/auth/login') + '?profile=' + urllib.parse.quote(session.get('auth_profile', '')))

    constants = _get_profile_constants()
    google_name = session.get('google_name', '')
    from core.consultant_dashboard import dashboard_client_required
    return render_template(
        'auth/identity.html',
        google_name=google_name,
        brand_name=_get_brand_name(constants),
        brand_theme=_get_brand_theme(constants),
        phone_countries=country_options(),
        collect_phone=not dashboard_client_required(constants),
    )


@auth_bp.route('/auth/send-code', methods=['POST'])
def auth_send_code():
    """Validate identity and send Twilio verification SMS."""
    google_sub = session.get('google_sub')
    if not google_sub:
        return jsonify({'error': 'Session expired. Please start over.'}), 401

    constants = _get_profile_constants()
    name = request.form.get('name', '').strip()
    phone = request.form.get('phone', '').strip()
    phone_country_code = request.form.get('phone_country_code', 'US').strip().upper()

    if not name:
        return jsonify({'error': 'Name is required.'}), 400

    normalized_name = _normalize_name(name)
    name_hash = _hash(normalized_name)

    from core.consultant_dashboard import dashboard_client_required, resolve_dashboard_client

    dashboard_result = None
    dashboard_required = dashboard_client_required(constants)
    normalized_phone = ""
    phone_hash = ""
    if dashboard_required:
        if phone:
            try:
                normalized_phone = normalize_supported_phone(phone, phone_country_code)
            except ValueError as exc:
                return jsonify({'error': str(exc)}), 400
            phone_hash = _hash(normalized_phone)
        dashboard_result = resolve_dashboard_client(
            constants,
            profile_data={
                'google_sub': google_sub,
                'email': session.get('google_email', ''),
                'vendor_slug': _current_vendor_slug(),
                'name_hash': name_hash,
                'phone_hash': phone_hash,
            },
            allow_email_only=not bool(phone_hash),
        )
        if dashboard_result.get('status') != 'resolved':
            return jsonify({'error': dashboard_result.get('error', 'Account not found. Please contact your consultant.')}), 403
        normalized_phone = (dashboard_result.get('phone_number') or '').strip()
        if not normalized_phone:
            return jsonify({'error': 'This account is missing a 2FA phone number. Please contact your consultant.'}), 403
        try:
            normalized_phone = normalize_supported_phone(normalized_phone)
        except ValueError:
            return jsonify({'error': 'This account has an invalid 2FA phone number. Please contact your consultant.'}), 403
        phone_hash = _hash(normalized_phone)
        user_id_hash = _save_dashboard_profile(
            constants,
            dashboard_result.get('client_id', ''),
            session.get('google_email', ''),
            name,
            normalized_phone,
            google_sub=google_sub,
        )
    else:
        if not phone:
            return jsonify({'error': 'Phone number is required.'}), 400
        try:
            normalized_phone = normalize_supported_phone(phone, phone_country_code)
        except ValueError as exc:
            return jsonify({'error': str(exc)}), 400
        phone_hash = _hash(normalized_phone)
        user_id_hash = _hash(google_sub + '|' + normalized_name + '|' + normalized_phone)

    # Check if user exists
    existing = _load_user_profile(constants, user_id_hash)
    if existing and not dashboard_result:
        # Verify all three factors match
        if existing.get('name_hash') != name_hash or existing.get('phone_hash') != phone_hash:
            # Generic error — don't reveal which factor failed
            return jsonify({'error': 'Unable to verify your identity.'}), 403
    elif not existing:
        # New user — create profile
        profile_data = {
            'client_id': dashboard_result.get('client_id', '') if dashboard_result else '',
            'google_sub': google_sub,
            'email': session.get('google_email', ''),
            'name_hash': name_hash,
            'phone_hash': phone_hash,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'last_login': datetime.now(timezone.utc).isoformat(),
        }
        _save_user_profile(constants, user_id_hash, profile_data)

    # Store for later verification
    session['auth_name'] = name
    session['auth_email'] = session.get('google_email', '')
    session['auth_phone'] = normalized_phone
    session['auth_user_id_hash'] = user_id_hash
    session['auth_client_id'] = dashboard_result.get('client_id', '') if dashboard_result else ''
    session['auth_via_password'] = False

    send_error = _send_verification_code(constants, normalized_phone)
    if send_error:
        return jsonify({'error': send_error}), 500

    return jsonify({'success': True, 'redirect': _tenant_path('/auth/verify')})


@auth_bp.route('/auth/verify', methods=['GET'])
def auth_verify():
    """Serve PIN entry form."""
    if not session.get('auth_user_id_hash'):
        return redirect(_tenant_path('/auth/login') + '?profile=' + urllib.parse.quote(session.get('auth_profile', '')))

    constants = _get_profile_constants()
    return render_template(
        'auth/verify.html',
        brand_name=_get_brand_name(constants),
        brand_theme=_get_brand_theme(constants),
    )


@auth_bp.route('/auth/verify-pin', methods=['POST'])
def auth_verify_pin():
    """Validate PIN via Twilio, mint JWT, redirect back to client."""
    user_id_hash = session.get('auth_user_id_hash')
    phone = session.get('auth_phone')
    if not user_id_hash or not phone:
        return jsonify({'error': 'Session expired. Please start over.'}), 401

    pin = request.form.get('pin', '').strip()
    if not pin or len(pin) != 6:
        return jsonify({'error': 'Please enter the 6-digit code.'}), 400

    constants = _get_profile_constants()

    # Verify PIN
    if AUTH_DEV_MODE:
        # Dev mode: accept 000000
        if pin != '000000':
            return jsonify({'error': 'Invalid code. In dev mode, use 000000.'}), 403
        print('[Auth] DEV MODE: PIN 000000 accepted')
    else:
        twilio_sid = constants.get('TWILIO_ACCOUNT_SID')
        twilio_token = constants.get('TWILIO_AUTH_TOKEN')
        verify_sid = constants.get('TWILIO_VERIFY_SERVICE_SID')

        try:
            from twilio.rest import Client
            client = Client(twilio_sid, twilio_token)
            check = client.verify.v2.services(verify_sid).verification_checks.create(
                to=phone,
                code=pin
            )
            if check.status != 'approved':
                return jsonify({'error': 'Invalid code. Please try again.'}), 403
        except Exception as e:
            print(f"[Auth] Twilio verify failed: {e}")
            return jsonify({'error': 'Verification failed. Please try again.'}), 500

    # Update last_login
    existing = _load_user_profile(constants, user_id_hash)
    if existing:
        existing['last_login'] = datetime.now(timezone.utc).isoformat()
        _save_user_profile(constants, user_id_hash, existing)

    from core.consultant_dashboard import dashboard_client_required, resolve_dashboard_client

    if dashboard_client_required(constants):
        dashboard_result = resolve_dashboard_client(constants, user_id_hash=user_id_hash)
        if dashboard_result.get('status') != 'resolved':
            return jsonify({'error': dashboard_result.get('error', 'Account not found. Please contact your consultant.')}), 403

    # Mint JWT
    import jwt as pyjwt
    jwt_secret = constants.get('AUTH_JWT_SECRET')
    now = int(time.time())
    token = pyjwt.encode({
        'user_id': user_id_hash,
        'client_id': session.get('auth_client_id', ''),
        'email': session.get('auth_email', session.get('google_email', '')),
        'name': session.get('auth_name', ''),
        'first_name': session.get('auth_first_name', ''),
        'vendor_slug': _current_vendor_slug(),
        'iat': now,
        'exp': now + AUTH_COOKIE_MAX_AGE_SECONDS,
    }, jwt_secret, algorithm='HS256')

    # Redirect back to client
    return_url = session.get('auth_return_url', '')
    if not _validate_return_url(return_url, constants):
        return jsonify({'error': 'Invalid return URL.'}), 400

    redirect_url = return_url

    # Clear auth session data
    for key in ['google_sub', 'google_email', 'google_name', 'auth_name', 'auth_first_name',
                'auth_email', 'auth_phone', 'auth_user_id_hash', 'auth_client_id',
                'auth_via_password', 'auth_profile', 'auth_return_url']:
        session.pop(key, None)
    session.pop('auth_vendor_slug', None)

    response = make_response(jsonify({'success': True, 'redirect': redirect_url}))
    response.set_cookie(
        AUTH_COOKIE_NAME,
        token,
        max_age=AUTH_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite='Lax',
        secure=request.is_secure,
        path='/',
    )
    return response
