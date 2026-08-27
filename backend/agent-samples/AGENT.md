# Agent Samples — AI Coding Assistant Guide

---

## Configuration Translation Guide

### Profile-Based Variable Naming

When users provide environment variables, they are often providing the **base variable names** without the profile prefix. The backend uses a profile-based system where all variables need a `<PROFILE>_` prefix.

**Example: User provides MLLM config for VOICE profile**

```bash
# DO NOT use these directly - they need profile prefix
MLLM_LOCATION=us-central1
MLLM_VENDOR=vertexai
ENABLE_MLLM=true
APP_ID=20b7c51...
```

**CORRECT translation to .env (with VOICE\_ prefix):**

```bash
VOICE_MLLM_LOCATION=us-central1
VOICE_MLLM_VENDOR=vertexai
VOICE_ENABLE_MLLM=true
VOICE_APP_ID=20b7c51...
```

### Critical Variable Names

**LOCATION vs REGION:**

- Backend expects: `MLLM_LOCATION`
- NOT: `MLLM_REGION`

If user provides `MLLM_LOCATION=us-central1`, translate to `VOICE_MLLM_LOCATION=us-central1` (DO NOT change LOCATION to REGION!)

### Variable Naming Pattern

Profile variables follow: `<PROFILE>_<VARIABLE>` format

```bash
# CORRECT
VOICE_MLLM_VENDOR=vertexai
VOICE_MLLM_MODEL=gemini-live-2.5-flash-preview-native-audio-09-2025

# WRONG (double MLLM)
VOICE_MLLM_MLLM_VENDOR=vertexai
```

### Debugging Agent Creation Failures

**Symptom:** RTM error `-11033: user offline`

**Root cause:** Agent failed to create (400 error from Agora API)

**How to debug:**

1. Check backend logs for `Response status: 400`
2. View most recent curl dump: `ls -lt /tmp/agora_curl_*.sh | head -1`
3. Look for `"location": null` in mllm params (should be `"location": "us-central1"`)
4. Verify `"enable_mllm": true` in advanced_features

**Common causes:**

- Missing or null `location` field in MLLM config
- Invalid GCP credentials
- Wrong model name or region

**Logs not appearing?** The backend must be started with `python3 -u` (unbuffered stdout). Without this flag, Python buffers `print()` output and agent IDs, response codes, and error messages will not appear in terminal output or log capture files. This is the most common reason for "missing" logs.

### Required MLLM Variables

MLLM mode supports two vendors: **Gemini Live** (VertexAI) and **OpenAI Realtime**. The backend builds vendor-specific payloads — no null fields leak across vendors.

**Gemini Live (VertexAI):**

```bash
VOICE_ENABLE_MLLM=true
VOICE_MLLM_VENDOR=vertexai
VOICE_MLLM_MODEL=gemini-live-2.5-flash-preview-native-audio-09-2025
VOICE_MLLM_ADC_CREDENTIALS_STRING={...GCP service account JSON...}
VOICE_MLLM_PROJECT_ID=your-gcp-project-id
VOICE_MLLM_LOCATION=us-central1  # NOT REGION!
VOICE_MLLM_VOICE=Charon
VOICE_MLLM_TRANSCRIBE_AGENT=true
VOICE_MLLM_TRANSCRIBE_USER=true
VOICE_ASR_VENDOR=ares
VOICE_ASR_LANGUAGE=en-US
VOICE_VAD_SILENCE_DURATION_MS=300
VOICE_ENABLE_AIVAD=true
```

**OpenAI Realtime:**

```bash
VOICE_ENABLE_MLLM=true
VOICE_MLLM_VENDOR=openai
VOICE_MLLM_MODEL=gpt-4o-realtime-preview
VOICE_MLLM_API_KEY=sk-...
VOICE_MLLM_STYLE=openai
VOICE_MLLM_VOICE=alloy
VOICE_ASR_VENDOR=ares
VOICE_ASR_LANGUAGE=en-US
VOICE_VAD_SILENCE_DURATION_MS=300
VOICE_ENABLE_AIVAD=true
```

### Pipeline Mode (Agent Builder)

Pipeline mode is an alternative to inline LLM/TTS/ASR configuration. Instead of specifying every vendor setting in `.env`, you create a pipeline in [Agora Agent Builder](https://console.agora.io) and reference it by ID. Agora resolves all STT, TTS, LLM, and AIVAD config from the pipeline — the backend only sends connection properties. **No LLM API key, TTS key, or ASR config is needed.**

**Minimal `.env` for pipeline mode:**

```bash
# Only 3 values required — no LLM/TTS/ASR keys needed
VOICE_APP_ID=your_app_id
VOICE_APP_CERTIFICATE=your_app_certificate
VOICE_PIPELINE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional overrides (pipeline defaults used if omitted)
VOICE_DEFAULT_PROMPT=You are a helpful assistant.
VOICE_DEFAULT_GREETING=Hello!
```

**Key behaviors:**

- Only `APP_ID`, `APP_CERTIFICATE`, and `PIPELINE_ID` are required — no `LLM_API_KEY`, `TTS_KEY`, `TTS_VENDOR`, or `TTS_VOICE_ID` needed
- Uses token auth (v007 token from `APP_CERTIFICATE`), not Basic auth — no `AGENT_AUTH_HEADER` needed
- The `pipeline_id` query parameter overrides the env var: `/start-agent?channel=test&pipeline_id=xxx`
- Only `prompt` and `greeting` are passed as `overrides.llm` — the pipeline owns ASR, AIVAD, TTS, and LLM config
- Avatar config is still sent separately (not part of the pipeline)
- **Transcript delivery requires `parameters.transcript`** — see note below

**Transcript delivery in pipeline mode:**

The pipeline configures LLM/TTS/ASR/AIVAD, but `parameters.transcript` is a **connection-level setting** that must be sent in the join payload. Without it, the Agora engine does not deliver agent transcript messages via RTM — user transcripts may still appear (from ASR events) but agent responses will be missing from the client UI.

The backend always sends this in pipeline mode:

```json
"parameters": {
  "transcript": {
    "enable": true,
    "protocol_version": "v2",
    "enable_words": false
  },
  "enable_dump": true
}
```

In non-pipeline (standard TTS+LLM) mode, this is also sent automatically. In MLLM mode (Gemini Live / OpenAI Realtime), transcription is handled internally by the model so `parameters.transcript` is not needed.

### Pipeline + Custom LLM Override

You can use a pipeline for TTS/ASR/AIVAD while pointing the LLM to your own server. This lets the pipeline handle voice processing while you intercept and proxy all LLM requests (for RAG, logging, tool calling, etc.).

**Critical:** Custom LLM config must go in `properties.llm` as a full LLM block — **NOT** in `overrides.llm`. The `overrides.llm` block only accepts lightweight tweaks (`system_messages`, `greeting_message`). The API silently ignores `url`, `vendor`, and `style` inside overrides — no error is returned, but the pipeline's built-in LLM is used instead. You must supply a complete `properties.llm` with `url`, `api_key`, `vendor`, `style`, `system_messages`, `greeting_message`, `failure_message`, `max_history`, and `params`.

**`.env` for pipeline + custom LLM:**

```bash
VIDEO_CLLM_APP_ID=your_app_id
VIDEO_CLLM_APP_CERTIFICATE=your_app_certificate
VIDEO_CLLM_PIPELINE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Custom LLM — must use a publicly reachable URL (Agora cloud calls it)
# Use a tunnel (cloudflared, ngrok) for local dev
VIDEO_CLLM_LLM_URL=https://your-tunnel.trycloudflare.com/chat/completions
VIDEO_CLLM_LLM_API_KEY=sk-...
VIDEO_CLLM_LLM_MODEL=gpt-4o-mini
VIDEO_CLLM_LLM_VENDOR=custom
VIDEO_CLLM_LLM_STYLE=openai
```

**What the backend sends (simplified):**

```json
{
  "name": "channel",
  "pipeline_id": "xxx",
  "properties": {
    "channel": "...",
    "token": "...",
    "llm": {
      "url": "https://your-tunnel.../chat/completions",
      "api_key": "sk-...",
      "vendor": "custom",
      "style": "openai",
      "system_messages": [{"role": "system", "content": "..."}],
      "greeting_message": "...",
      "failure_message": "...",
      "max_history": 32,
      "params": {"model": "gpt-4o-mini", "channel": "...", ...}
    }
  }
}
```

**Key gotchas:**

- `LLM_URL` must be reachable from Agora's cloud — `localhost` won't work. Use `cloudflared tunnel --url http://localhost:8101` or ngrok
- The `local_server.py` register-agent flow extracts tokens from `properties.llm.params` OR `overrides.llm.params` to send to the custom LLM server
- `vendor: "custom"` causes Agora to add `turn_id` and `timestamp` to each LLM request, which the custom LLM server can use for conversation tracking

---

## Companion Servers (Optional)

These standalone servers extend simple-backend with advanced capabilities. They are **not required** for basic operation.

- **[server-custom-llm](https://github.com/AgoraIO-Conversational-AI/server-custom-llm)** — Custom LLM proxy. Intercepts LLM requests for RAG, custom prompts, tool calling, and response formatting. Config only — no backend code changes needed. Set `LLM_URL` to your server endpoint, `LLM_VENDOR=custom`, `LLM_STYLE=openai`.
- **[server-mcp](https://github.com/AgoraIO-Conversational-AI/server-mcp)** — MCP Memory Server. Gives agents persistent per-user memory via tool calling. Configure via `MCP_SERVERS` JSON array in `.env`.

### Port Reference

| Server     | Language | Port |
| ---------- | -------- | ---- |
| MCP Memory | Python   | 8090 |
| MCP Memory | Node.js  | 8091 |
| MCP Memory | Go       | 8092 |
| Custom LLM | Python   | 8100 |
| Custom LLM | Node.js  | 8101 |
| Custom LLM | Go       | 8102 |

### LLM Config Fields Reference

Fields supported in the LLM config block sent to Agora ConvoAI API:

| Field              | Description                                                       |
| ------------------ | ----------------------------------------------------------------- |
| `url`              | LLM endpoint URL                                                  |
| `api_key`          | API key for the LLM provider                                      |
| `style`            | Protocol style: `openai` (default), `gemini`, `anthropic`, `dify` |
| `vendor`           | `custom` (adds turn_id + timestamp), `azure` (Azure OpenAI)       |
| `greeting_configs` | Greeting behavior, e.g. `{"mode": "single_first"}`                |
| `mcp_servers`      | Array of MCP server configs for tool calling                      |

---

## Backend Configuration

The backend (`simple-backend/`) uses a **profile-based configuration system** to manage different client types and use cases.

### Default Profiles (Required)

Two profiles are required for the clients to work out of the box:

**1. `VOICE` profile** - Used by the voice client (`VOICE_*` prefixed variables)

- **Architecture**: TTS + LLM mode (Rime TTS + OpenAI LLM)
- **Key features**: Rime voice synthesis with "astra" voice, GPT-4o-mini LLM
- **Transcript delivery**: RTM stream messages with `is_final=true` for completed utterances

**2. `VIDEO` profile** - Used by the video client (`VIDEO_*` prefixed variables)

- **Architecture**: Traditional TTS + LLM stack with avatar
- **Key features**: Separate TTS (ElevenLabs), LLM (GPT-4o), avatar (HeyGen, Anam, or Akool)
- **Transcript delivery**: RTM stream messages
- **Akool avatar note**: Akool avatars only support 16kHz audio. Set `TTS_SAMPLE_RATE=16000` when using `AVATAR_VENDOR=akool`.

**Note**: Profile names are **case-insensitive**. The server normalizes all profile names to lowercase, so `VOICE`, `voice`, or `Voice` all work identically. Clients default to uppercase (`VOICE`, `VIDEO`) but any case is accepted.

### Profile System Mechanics

**Environment Variable Naming:**

- Profile variables use `<PROFILE>_<VARIABLE>` format
- Example: `VOICE_APP_ID`, `VIDEO_TTS_VENDOR`, `VIDEO_AVATAR_VENDOR`
- When clients send a profile parameter, the backend loads all matching prefixed variables

**Client Behavior:**

- Voice client sends `profile=VOICE` by default (can override via "Server Profile" field)
- Video client sends `profile=VIDEO` by default (can override via "Server Profile" field)
- Empty "Server Profile" field uses the default for that client type
- Profile names are case-insensitive (server normalizes to lowercase)

**How It Works:**

1. Client makes request: `http://localhost:8082/start-agent?channel=test&profile=VOICE`
2. Backend normalizes profile to lowercase: `"VOICE"` -> `"voice"`
3. Backend calls `initialize_constants(profile="voice")` in `core/config.py`
4. Config system loads all `VOICE_*` prefixed variables from `.env`
5. Agent starts with voice profile configuration

### Transcript Configuration Differences

**MLLM Mode (Gemini Live or OpenAI Realtime):**

```bash
# Gemini Live
VOICE_ENABLE_MLLM=true
VOICE_MLLM_VENDOR=vertexai
VOICE_MLLM_MODEL=gemini-live-2.5-flash-preview-native-audio-09-2025
# Transcription is built-in, delivered via RTM stream messages
VOICE_MLLM_TRANSCRIBE_AGENT=true  # Agent speech transcription
VOICE_MLLM_TRANSCRIBE_USER=true   # User speech transcription

# OpenAI Realtime (alternative)
# VOICE_MLLM_VENDOR=openai
# VOICE_MLLM_MODEL=gpt-4o-realtime-preview
# VOICE_MLLM_API_KEY=sk-...
# VOICE_MLLM_STYLE=openai
```

**TTS+LLM Mode (Traditional):**

```bash
VIDEO_ENABLE_MLLM=false
VIDEO_LLM_MODEL=gpt-4o
VIDEO_TTS_VENDOR=elevenlabs
VIDEO_AVATAR_VENDOR=heygen
# Transcription delivered in start-agent API response
VIDEO_MLLM_TRANSCRIBE_AGENT=true  # Required for agent transcript
VIDEO_MLLM_TRANSCRIBE_USER=true   # Required for user transcript
```

### Active Profiles

- `voice` - Default for voice client (MLLM — Gemini Live or OpenAI Realtime)
- `video` - Default for video client (TTS+LLM+HeyGen)
- `video_anam` - Alternative with Anam avatar
- `video_heygen` - Alternative HeyGen configuration
- `video_mllm_heygen` - MLLM mode with HeyGen avatar

Recommended local avatar-switching profile names:

- `anam` - Anam avatar profile for shared links
- `generic_tru` - Trulience generic avatar profile
- `generic_ls` - LemonSlice generic avatar profile

For the video avatar client on `http://localhost:8084`, these profiles are intended to support direct share links such as:

```text
http://localhost:8084/?autoconnect=true&profile=anam
http://localhost:8084/?autoconnect=true&profile=generic_tru
http://localhost:8084/?autoconnect=true&profile=generic_ls
```

`voice_id`, `avatar_id`, and `avatar_api_base_url` can also be overridden per link via the query string.

---

## Local Development Quick Start

### Prerequisites

- Node.js >= 20.9.0 (required by Next.js 16). Run `nvm use` in the repo root — the `.nvmrc` file selects the correct version automatically.
- Python 3.x

### Step 1: Start the backend

```bash
cd simple-backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements-local.txt
cp .env.example .env
# Edit .env — fill in credentials (see Backend Configuration section above)
python3 -u local_server.py
```

> **Important:** Always use `python3 -u` (unbuffered stdout). Without `-u`, Python buffers output and critical logs — agent IDs, API response codes, error messages — will be delayed or lost entirely. This applies to local dev, PM2, systemd, and any process manager that captures stdout.

### Step 2: Start a frontend client

**Voice client:**

```bash
cd react-voice-client
npm install --legacy-peer-deps
npm run dev
# Open http://localhost:8083
```

**Video avatar client:**

```bash
cd react-video-client-avatar
npm install --legacy-peer-deps
npm run dev
# Open http://localhost:8084
```

---

## Production Deployment (EC2 + nginx on port 443)

This section documents how to serve all agent-samples behind nginx on port 443 alongside an existing application, using path-based routing.

### Architecture

```
nginx :443 (convoai-demo.agora.io)
  /                              -> /var/www/palabra/         (existing SPA)
  /v1/, /query, /oauth, /pstn   -> localhost:7080             (existing API)
  /simple-backend/               -> localhost:8082             (Flask API, prefix stripped)
  /react-voice-client/           -> localhost:8083             (Next.js voice client)
  /react-video-client-avatar/    -> localhost:8084             (Next.js video+avatar client)
  /simple-voice-client-no-backend/     -> static files via alias
  /simple-voice-client-with-backend/   -> static files via alias
```

### Source Code Changes (backward-compatible)

Two env-var-driven configs were added. When env vars are **not set** (local dev), behavior is identical to the original code.

**`next.config.ts`** (both `react-voice-client` and `react-video-client-avatar`):

```typescript
const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  typescript: { ignoreBuildErrors: true },
  transpilePackages: ["agora-agent-client-toolkit", "@agora/agent-ui-kit"],
};
```

- `basePath` makes Next.js serve all routes/assets under the specified prefix
- `typescript.ignoreBuildErrors` bypasses an unused `@ts-expect-error` in `@agora/agent-ui-kit`

**`VoiceClient.tsx` / `VideoAvatarClient.tsx`**:

```typescript
const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8082";
```

- When `NEXT_PUBLIC_BACKEND_URL=/simple-backend` is set at build time, the browser makes relative requests to the same origin
- When not set, defaults to `http://localhost:8082` for local dev

### Step 1: Python Backend Setup

```bash
cd simple-backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-local.txt
cp .env.example .env
# Edit .env with real Agora, LLM, TTS, and avatar credentials
```

Create `simple-backend/start.sh` (PM2 workaround for Python):

```bash
#!/bin/bash
cd /home/ubuntu/agent-samples/simple-backend
source venv/bin/activate
PORT=8082 exec python3 -u local_server.py
```

```bash
chmod +x start.sh
```

### Step 2: Build Next.js Apps

```bash
# Voice client
cd react-voice-client
npm install --legacy-peer-deps
NEXT_PUBLIC_BASE_PATH=/react-voice-client NEXT_PUBLIC_BACKEND_URL=/simple-backend npm run build

# Video avatar client
cd ../react-video-client-avatar
npm install --legacy-peer-deps
NEXT_PUBLIC_BASE_PATH=/react-video-client-avatar NEXT_PUBLIC_BACKEND_URL=/simple-backend npm run build
```

### Step 3: PM2 Ecosystem Config

Create `ecosystem.config.js` in the repo root:

```javascript
module.exports = {
  apps: [
    {
      name: "simple-backend",
      script: "/home/ubuntu/agent-samples/simple-backend/start.sh",
      interpreter: "bash",
      watch: false,
      max_memory_restart: "200M",
    },
    {
      name: "react-voice-client",
      cwd: "/home/ubuntu/agent-samples/react-voice-client",
      script: "node_modules/.bin/next",
      args: "start -p 8083",
      env: {
        NODE_ENV: "production",
        PORT: 8083,
        NEXT_PUBLIC_BASE_PATH: "/react-voice-client",
        NEXT_PUBLIC_BACKEND_URL: "/simple-backend",
      },
      watch: false,
      max_memory_restart: "500M",
    },
    {
      name: "react-video-client-avatar",
      cwd: "/home/ubuntu/agent-samples/react-video-client-avatar",
      script: "node_modules/.bin/next",
      args: "start -p 8084",
      env: {
        NODE_ENV: "production",
        PORT: 8084,
        NEXT_PUBLIC_BASE_PATH: "/react-video-client-avatar",
        NEXT_PUBLIC_BACKEND_URL: "/simple-backend",
      },
      watch: false,
      max_memory_restart: "500M",
    },
  ],
};
```

**Critical:** The `NEXT_PUBLIC_BASE_PATH` env var must be set at **both** build time and runtime. `next start` re-reads `next.config.ts` at startup, so the PM2 env must match the build env. Without this, basePath evaluates to `""` at runtime and all pages return 404.

```bash
pm2 start ecosystem.config.js
pm2 save
```

### Step 4: Nginx Configuration

Add these location blocks **before** the catch-all `location /` block:

```nginx
    # --- Agent Samples ---

    # Flask backend (strip /simple-backend prefix via trailing slash on proxy_pass)
    location /simple-backend/ {
        proxy_pass http://localhost:8082/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    # Next.js voice client (^~ prevents regex cache block from stealing .js/.css)
    location ^~ /react-voice-client {
        proxy_pass http://localhost:8083;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Next.js video avatar client (^~ prevents regex cache block from stealing .js/.css)
    location ^~ /react-video-client-avatar {
        proxy_pass http://localhost:8084;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Static HTML clients
    location ^~ /simple-voice-client-no-backend/ {
        alias /home/ubuntu/agent-samples/simple-voice-client-no-backend/;
        index index.html;
    }

    location ^~ /simple-voice-client-with-backend/ {
        alias /home/ubuntu/agent-samples/simple-voice-client-with-backend/;
        index index.html;
    }
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Step 5: File Permissions

```bash
chmod o+x /home/ubuntu /home/ubuntu/agent-samples
chmod -R o+r /home/ubuntu/agent-samples/simple-voice-client-no-backend/
chmod -R o+r /home/ubuntu/agent-samples/simple-voice-client-with-backend/
```

### Verification

```bash
curl -s https://convoai-demo.agora.io/simple-backend/health
# {"service":"agora-convoai-backend","status":"ok"}

curl -s -o /dev/null -w "%{http_code}" https://convoai-demo.agora.io/react-voice-client
# 200

curl -s -o /dev/null -w "%{http_code}" https://convoai-demo.agora.io/react-video-client-avatar
# 200

curl -s -o /dev/null -w "%{http_code}" https://convoai-demo.agora.io/simple-voice-client-no-backend/
# 200

curl -s -o /dev/null -w "%{http_code}" https://convoai-demo.agora.io/simple-voice-client-with-backend/
# 200
```

### Key Gotchas

1. **`^~` on proxy locations is required.** Without it, an existing `location ~* \.(js|css|...)$` regex block for static asset caching will intercept Next.js `_next/static/` requests and look for them in the wrong root directory, returning 404.

2. **PM2 Python interpreter bug.** PM2 ignores the `interpreter` field for Python scripts and wraps them in its JS `ProcessContainerFork.js`, which Python then tries to parse as Python code. Workaround: use a bash shell script that activates the venv and runs Python directly.

3. **`NEXT_PUBLIC_*` env vars must be set at runtime too.** `next start` re-evaluates `next.config.ts` at startup. If `NEXT_PUBLIC_BASE_PATH` is only set during `npm run build` but not when `next start` runs (e.g., via PM2), basePath evaluates to `""` at runtime and all pages return 404 despite being correctly built.

4. **Trailing slash on `proxy_pass` for Flask.** `location /simple-backend/` paired with `proxy_pass http://localhost:8082/;` (note trailing `/`) strips the `/simple-backend/` prefix. Flask routes are `/start-agent`, not `/simple-backend/start-agent`.

5. **No changes needed for local dev.** When no `NEXT_PUBLIC_*` env vars are set, basePath defaults to `""` and backend URL defaults to `http://localhost:8082` — identical to the original behavior.
