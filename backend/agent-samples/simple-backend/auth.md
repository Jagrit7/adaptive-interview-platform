# Optional Auth + Encrypted Session Memory

## Overview

Optional authentication and session memory layer. Entirely additive — existing React clients, backend, and custom LLM work unchanged when auth is not enabled. When enabled, users authenticate via either email/password + SMS 2FA or Google + SMS 2FA, and their session history is encrypted and persisted on disk for continuity across sessions.

All auth endpoints live in the existing simple-backend (Flask). No separate auth service needed.

When auth is not configured for a profile, everything works as before (anonymous access).

---

## Quick Setup (Operator Only)

> **Important:** Only the operator (you) sets up Google and Twilio accounts. End users either sign in with an email/password provisioned in the dashboard or click Google sign-in for matching Gmail accounts.

### 1. Google OAuth (~5 minutes)

1. Go to https://console.cloud.google.com/
2. Create or select a project
3. APIs & Services → OAuth consent screen
   - User type: External
   - Scopes: email, profile
4. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URI: `http://localhost:8082/auth/google/callback`
   - For production, add your real domain too (e.g. `https://yourdomain.com/auth/google/callback`)
   - You can register multiple redirect URIs — Google allows all of them simultaneously
5. Copy **Client ID** and **Client Secret**

> **How the redirect works:** Google OAuth is a browser-side redirect — Google sends the user's browser back to your registered URI with a `?code=` parameter. Google's servers never connect to your backend directly. This means `localhost` works fine because it only needs to be reachable from the user's own browser, not from the internet.
>
> **Multiple environments:** Register multiple redirect URIs (dev + production) in the same Google project. The code dynamically builds the callback URL from the server's own hostname (`request.url_root`), so it adapts automatically. The URI sent at auth time must exactly match one of the pre-registered URIs — Google validates this.
>
> No HTTPS required on localhost.

### 2. Twilio Verify (~5 minutes)

1. Create account at https://www.twilio.com/try-twilio
   - Free trial = $15 credit, ~300 SMS verifications
2. Dashboard → copy **Account SID** and **Auth Token**
3. Verify → Services → Create new service
   - Friendly name: anything (e.g. "AI Therapist Auth")
   - Channel: SMS
4. Copy **Verify Service SID**

### 3. Generate Keys

```bash
# Encryption key (64 hex chars) — use the SAME key in both backend and custom LLM .env
python3 -c "import secrets; print(secrets.token_hex(32))"

# Flask secret + JWT secret (generate two separate values)
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 4. Backend .env (simple-backend/.env)

Add these for the profile that needs auth (example: VIDEO_CLLM profile):

```env
FLASK_SECRET_KEY=<random-string-from-step-3>

VIDEO_CLLM_AUTH_JWT_SECRET=<random-string-from-step-3>
VIDEO_CLLM_GOOGLE_CLIENT_ID=<from-google-step-5>.apps.googleusercontent.com
VIDEO_CLLM_GOOGLE_CLIENT_SECRET=GOCSPX-<from-google-step-5>
VIDEO_CLLM_TWILIO_ACCOUNT_SID=AC<from-twilio-step-2>
VIDEO_CLLM_TWILIO_AUTH_TOKEN=<from-twilio-step-2>
VIDEO_CLLM_TWILIO_VERIFY_SERVICE_SID=VA<from-twilio-step-4>
VIDEO_CLLM_ENCRYPTION_KEY=<64-hex-chars-from-step-3>
VIDEO_CLLM_AUTH_DATA_DIR=./data
VIDEO_CLLM_MAX_SESSION_DURATION=3600
VIDEO_CLLM_ALLOWED_RETURN_ORIGINS=http://localhost:8084,http://localhost:8083
```

### 5. Custom LLM .env (server-custom-llm/node/.env)

```env
ENABLE_MEMORY=true
ENCRYPTION_KEY=<same-64-hex-chars-as-backend>
DATA_DIR=./data
MAX_HISTORY_SESSIONS=5
```

### 6. Install Python Dependencies

From `simple-backend/`:

```bash
source venv/bin/activate
pip install PyJWT google-auth google-auth-oauthlib twilio cryptography
```

All five packages are required — `twilio` in particular is easy to miss since the backend starts fine without it (the import is deferred until the first SMS send).

### 7. Twilio Free Trial — Verified Caller IDs

On a free trial, Twilio can only send SMS to phone numbers you've explicitly verified:

1. Go to https://console.twilio.com/ → **Phone Numbers** → **Manage** → **Verified Caller IDs**
2. Click **Add a new Caller ID**
3. Enter the phone number and verify it via SMS or call
4. Repeat for each number you want to test with

Without this, the SMS send will fail silently (the backend returns "Failed to send verification code").

### 8. Set AUTH_DEV_MODE

In `simple-backend/.env`:

```env
# Set to false for real Google OAuth + Twilio SMS
AUTH_DEV_MODE=false

# Set to true to skip Google/Twilio (PIN is always 000000)
# AUTH_DEV_MODE=true
```

### 9. Restart Services

After editing `.env`, restart:
- Python backend (reads `.env` at startup via `load_dotenv`)
- Node custom LLM server (reads `.env` at startup via `dotenv`)
- React client if `NEXT_PUBLIC_*` vars changed (baked at build time)

### 10. Test

Open `http://localhost:8084?profile=video_cllm` (add `&autoconnect=true` to auto-join after auth):

1. Redirects to Google sign-in → authorize with your Google account
2. First Name + Phone form → enter phone in international format (e.g. `+447775060085`)
3. Real SMS arrives with 6-digit PIN → enter it
4. Redirected back to the app, authenticated

> **Phone format:** The auth form now has a country dropdown and supports United States and United Kingdom numbers only.

---

## Testing

### Dev mode (no Google/Twilio needed)

Add to `simple-backend/.env`:
```env
AUTH_DEV_MODE=true
```

This skips Google OAuth (uses a fake "Dev User" identity) and skips Twilio SMS. The PIN is always `000000`. You still need `AUTH_JWT_SECRET` and `ENCRYPTION_KEY` set for the profile — dev mode only bypasses the external services, not the internal auth logic.

Minimal `.env` for dev mode testing:
```env
AUTH_DEV_MODE=true
FLASK_SECRET_KEY=dev-secret

VIDEO_CLLM_AUTH_JWT_SECRET=dev-jwt-secret
VIDEO_CLLM_ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
VIDEO_CLLM_AUTH_DATA_DIR=./data
VIDEO_CLLM_ALLOWED_RETURN_ORIGINS=http://localhost:8084,http://localhost:8083

# ... plus your normal VIDEO_CLLM_APP_ID, VIDEO_CLLM_LLM_URL, etc.
```

Then open `http://localhost:8084?profile=video_cllm` — you'll see:
1. Login page → either use dashboard email/password or click "Sign in with Google"
2. If using Google, enter name + phone and click "Send Code"
3. Enter `000000` → redirected back into the app with a 1-hour auth cookie

### Without auth (verify nothing breaks)

```bash
curl http://localhost:8082/auth-check?profile=video
# → { "auth_required": false, "authenticated": false }
```

Open `http://localhost:8084?profile=video` — should work exactly as before.

### With auth configured

```bash
curl http://localhost:8082/auth-check?profile=video_cllm
# → { "auth_required": true, "authenticated": false, "auth_url": "/auth/login?..." }
```

### Full browser flow

1. Open `http://localhost:8084?profile=video_cllm`
2. → Redirects to `/auth/login` → email/password form or Google sign-in → SMS verification flow
3. → SMS code → PIN entry → Redirect back into the app
4. → Normal UI loads, backend requests reuse the 1-hour auth cookie

### Verify memory works

1. Complete a chat session and hang up
2. Check custom LLM logs for "Saved session summary... with N voice samples, M vitals samples"
3. Check `data/users/<hash>/sessions/` for `.enc` files
4. Reconnect — custom LLM should log "Loaded N session(s)" and agent should reference previous session + biomarker baselines

> **Note:** After changing `user_id_hash` construction (now includes all three auth factors), old user data under `data/users/` is orphaned. Delete it: `rm -rf simple-backend/data/users/ server-custom-llm/node/data/users/`

---

## Architecture

```
                      AUTH DISABLED (default)
                      ========================
User → http://localhost:8084?profile=video
     → Client calls GET /auth-check?profile=video → { auth_required: false }
     → Client renders normal UI immediately
     → Backend: anonymous user, no JWT validation
     → Custom LLM: ephemeral, no memory


                      AUTH ENABLED
                      ========================
User → http://localhost:8084?profile=video_cllm

Client (on page load, before showing UI):
     → GET /auth-check?profile=video_cllm  (no Bearer token)
     → Backend: AUTH_JWT_SECRET is set for this profile
       → No valid token → 200 { auth_required: true, authenticated: false,
            auth_url: "/auth/login?profile=video_cllm&return=<current_url>" }
     → Client: window.location.href = auth_url (immediate redirect)

Backend Auth Pages (same server, :8082):
     → GET  /auth/login?profile=video_cllm&return=...
     → GET  /auth/google → Google OAuth consent
     → GET  /auth/google/callback → stores google_sub + email
     → GET  /auth/identity → name + phone form
     → POST /auth/send-code → validates 3 factors, sends Twilio SMS
     → GET  /auth/verify → 6-digit PIN entry
     → POST /auth/verify-pin → validates PIN, mints JWT, sets 1-hour auth cookie, redirects back

Client (page loads again):
     → GET /auth-check with backend auth cookie → { authenticated: true }
     → Normal UI, all backend fetches include cookies and may also send a legacy Authorization header
     → user_id flows to Custom LLM via register-agent
     → Custom LLM loads encrypted history + biomarker baselines, injects into prompt
     → During session: accumulates voice biomarker + camera vitals running averages
     → On session end: summarizes, computes biomarker averages, encrypts, writes to disk
```

## Auth Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth-check` | Check if profile needs auth, validate backend auth cookie or Bearer token |
| GET | `/auth/login` | Store profile + return URL in session, serve Google sign-in |
| GET | `/auth/google` | Redirect to Google OAuth |
| GET | `/auth/google/callback` | Exchange code for user info |
| GET | `/auth/identity` | Serve name + phone form |
| POST | `/auth/send-code` | Validate 3-factor match, send Twilio SMS |
| GET | `/auth/verify` | Serve PIN entry form |
| POST | `/auth/verify-pin` | Validate PIN, mint JWT, set auth cookie, redirect back |

## Memory Module

Auth protects encrypted session memory. The `user_id_hash` is derived from all three auth factors:

```
user_id_hash = sha256(google_sub + '|' + normalized_name + '|' + normalized_phone)
```

This means:
- **Same person, same identity** → same hash → same encrypted memory
- **Different name or phone** → different hash → completely separate storage
- **Two people on a shared machine** → can't access each other's sessions (different Google account, name, or phone = different encryption key)

The hash flows from the backend JWT to the custom LLM, where it's used as both the disk path and the HKDF input for per-user encryption key derivation. Session summaries (including voice biomarker and camera vitals averages) are encrypted with AES-256-GCM and stored on disk.

See the **[Session Memory](../../server-custom-llm/node/README.md#session-memory)** section in the custom LLM README for implementation details (encryption, biomarker accumulation, prompt injection format).

**Disk structure:**
```
simple-backend/data/users/{user_id_hash}/
  profile.enc                    # user profile (name_hash, phone_hash — written by backend auth)

server-custom-llm/node/data/users/{user_id_hash}/
  sessions/
    2026-03-25T11-30-00-000Z.enc # encrypted session summary + biomarker averages (written by custom LLM)
```

## Session Duration Limiting

When `MAX_SESSION_DURATION` is set (seconds):
- Custom LLM tracks elapsed time per agent
- At 5 minutes before limit: injects wrap-up system message
- At limit: returns closing message and calls Agora hangup API

## Security

- `user_id_hash = sha256(google_sub + '|' + normalized_name + '|' + normalized_phone)` — tied to all three auth factors so two people can't access each other's encrypted memory, even on a shared machine
- All three factors (google_sub + name_hash + phone_hash) must match before SMS is sent
- Generic error messages — never reveal which factor failed
- backend auth cookie: 1-hour expiry, `HttpOnly`, reused across invite/message/meeting deep links
- on expiry the user must re-authenticate with password or Google plus Twilio OTP
- this limits exposure on shared or unattended machines
- legacy Bearer token support remains only as a compatibility fallback for older flows
- Return URL validated against ALLOWED_RETURN_ORIGINS allowlist
- AES-256-GCM encryption with per-user derived keys, random salt per file
- No PII in logs — user_id_hash only
- data/ directory in .gitignore

---

## Implementation Status

### Files created

| File | Description |
|------|-------------|
| `simple-backend/core/auth.py` | Flask Blueprint, all auth routes + helpers |
| `simple-backend/templates/auth/login.html` | Google sign-in page |
| `simple-backend/templates/auth/identity.html` | Name + phone form |
| `simple-backend/templates/auth/verify.html` | 6-digit PIN entry |
| `server-custom-llm/node/memory_store.js` | Encrypted session memory module |

### Files modified

| File | Changes |
|------|---------|
| `simple-backend/local_server.py` | Blueprint registration, auth check in /start-agent, CORS, secret_key |
| `simple-backend/core/agent.py` | user_id added to LLM params (pipeline + inline) |
| `simple-backend/core/config.py` | 10 auth-related constants added |
| `simple-backend/requirements-local.txt` | PyJWT, google-auth, twilio, cryptography |
| `simple-backend/.env.example` | Auth config section added |
| `simple-backend/.gitignore` | data/ directory excluded |
| `server-custom-llm/node/custom_llm.js` | Memory module loaded, user_id in earlyParams, session duration limiting |
| `react-video-client-avatar/components/VideoAvatarClient.tsx` | Auth check on mount, fetchWithAuth helper |

### Not yet tested

- Live Google OAuth flow (needs real credentials)
- Twilio SMS sending (needs real account)
- Full end-to-end browser flow
- Encryption round-trip (Python writes profile.enc, Node writes sessions/*.enc)
- Session duration auto-hangup

### Known discrepancies vs original plan

- Plan says config.py and agent.py are "unchanged" — both were modified (10 new constants, user_id in params)
- Python encryption format: salt(16) + nonce(12) + ciphertext (tag appended by cryptography lib)
- Node encryption format: salt(16) + nonce(12) + tag(16) + ciphertext (tag stored separately)
- This is fine — Python only reads/writes profile.enc, Node only reads/writes sessions/*.enc
