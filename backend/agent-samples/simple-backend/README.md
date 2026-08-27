# Simple Backend

Python backend for managing AI agents and generating RTC credentials. Supports local development, cloud instances, and AWS Lambda deployment.

> **📘 For AI Coding Assistants:** See [../AGENT.md](../AGENT.md) for comprehensive implementation guidance and API reference.

## Quick Start

**1. Install dependencies:**

```bash
pip3 install -r requirements-local.txt
```

**2. Configure `.env` file:**

Copy `.env.example` to `.env` and fill in your credentials. See [Configuration](#configuration) below.

**3. Run server:**

```bash
python3 -u local_server.py
# Or specify custom port:
PORT=8082 python3 -u local_server.py
```

Server runs on http://localhost:8082 (default).

> **Important:** Always use the `-u` flag (unbuffered output). Without it, Python buffers stdout and critical log lines (agent IDs, API response status, curl dumps) may not appear in the terminal or log files until much later — or not at all if the process is killed. Alternatively, set `PYTHONUNBUFFERED=1` in your environment.

## Configuration

The backend uses **profiles** to manage client configurations via environment variables.

### Default Profiles

**Voice Client** uses the `voice` profile (`VOICE_*` prefixed variables):

```bash
# Agora credentials (required)
VOICE_APP_ID=
VOICE_APP_CERTIFICATE=       # Required: enables token auth (no AGENT_AUTH_HEADER needed)

# Pipeline mode (simplest — skip all LLM/TTS/ASR config below)
# VOICE_PIPELINE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# --- Inline config (only needed WITHOUT pipeline) ---

# MLLM settings — choose one vendor:

# Option A: Gemini Live (VertexAI)
VOICE_ENABLE_MLLM=true
VOICE_MLLM_VENDOR=vertexai
VOICE_MLLM_MODEL=gemini-live-2.5-flash-preview-native-audio-09-2025
VOICE_MLLM_ADC_CREDENTIALS_STRING={"type":"service_account"...}
VOICE_MLLM_PROJECT_ID=
VOICE_MLLM_LOCATION=us-central1
VOICE_MLLM_VOICE=Charon
VOICE_MLLM_TRANSCRIBE_AGENT=true
VOICE_MLLM_TRANSCRIBE_USER=true

# Option B: OpenAI Realtime
# VOICE_ENABLE_MLLM=true
# VOICE_MLLM_VENDOR=openai
# VOICE_MLLM_MODEL=gpt-4o-realtime-preview
# VOICE_MLLM_API_KEY=sk-...
# VOICE_MLLM_STYLE=openai
# VOICE_MLLM_VOICE=alloy

# ASR and AIVAD
VOICE_ASR_VENDOR=ares
VOICE_ENABLE_AIVAD=true

# Prompts
VOICE_DEFAULT_GREETING=Hey There Sir
VOICE_DEFAULT_PROMPT=You are a friendly assistant.

# Debug
VOICE_ENABLE_CURL_DUMP=true
```

**Video Client** uses the `video` profile (`VIDEO_*` prefixed variables):

```bash
# Agora credentials (required)
VIDEO_APP_ID=
VIDEO_APP_CERTIFICATE=       # Required: enables token auth (no AGENT_AUTH_HEADER needed)

# Pipeline mode (simplest — skip all LLM/TTS/ASR config below)
# VIDEO_PIPELINE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# --- Inline config (only needed WITHOUT pipeline) ---

# LLM settings (direct OpenAI)
VIDEO_ENABLE_MLLM=false
VIDEO_LLM_API_KEY=
VIDEO_LLM_MODEL=gpt-4o

# LLM settings (custom LLM server — config only, no code changes needed)
# VIDEO_LLM_URL=https://<tunnel>.trycloudflare.com/chat/completions
# VIDEO_LLM_VENDOR=custom
# VIDEO_LLM_STYLE=openai

# TTS settings
VIDEO_TTS_VENDOR=elevenlabs
VIDEO_TTS_KEY=
VIDEO_TTS_VOICE_ID=
VIDEO_ELEVENLABS_MODEL=eleven_flash_v2_5
VIDEO_TTS_SAMPLE_RATE=24000

# ASR and AIVAD
VIDEO_ASR_VENDOR=ares
VIDEO_ENABLE_AIVAD=true

# Avatar settings
VIDEO_AVATAR_VENDOR=heygen
VIDEO_AVATAR_API_KEY=
VIDEO_AVATAR_ID=
VIDEO_HEYGEN_QUALITY=high
# For generic avatar provider:
# VIDEO_AVATAR_VENDOR=generic
# VIDEO_AVATAR_API_KEY=
# VIDEO_AVATAR_API_BASE_URL=
# VIDEO_AVATAR_ID=

# Prompts
VIDEO_DEFAULT_GREETING=Hey there, I am Quiz Master Bella...
VIDEO_DEFAULT_PROMPT=You are Bella, a quiz master...

# Debug
VIDEO_ENABLE_CURL_DUMP=true
```

**Recommended Avatar-Switching Profiles**

For shareable video avatar links, define three complete backend profiles instead of editing `VIDEO_*` between sessions:

```bash
ANAM_*
GENERIC_TRU_*
GENERIC_LS_*
```

Recommended mapping:

- `anam` -> `ANAM_*` variables with `ANAM_AVATAR_VENDOR=anam`
- `generic_tru` -> `GENERIC_TRU_*` variables with `GENERIC_TRU_AVATAR_VENDOR=generic`
- `generic_ls` -> `GENERIC_LS_*` variables with `GENERIC_LS_AVATAR_VENDOR=generic`

Important: profile lookup does not fall back to base variables. If you use `?profile=generic_tru`, all required settings for Agora, LLM, TTS, ASR, and avatar must exist under `GENERIC_TRU_*`.

Example local client URLs:

```text
http://localhost:8084/?autoconnect=true&profile=anam
http://localhost:8084/?autoconnect=true&profile=generic_tru
http://localhost:8084/?autoconnect=true&profile=generic_ls
```

Example with per-link overrides:

```text
http://localhost:8084/?autoconnect=true&profile=anam&avatar_id=<anam-avatar-id>&voice_id=<elevenlabs-voice-id>
http://localhost:8084/?autoconnect=true&profile=generic_tru&avatar_id=<trulience-avatar-id>&voice_id=<elevenlabs-voice-id>
http://localhost:8084/?autoconnect=true&profile=generic_ls&avatar_id=<lemonslice-avatar-id>&voice_id=<elevenlabs-voice-id>
```

### Pipeline Mode (Agent Builder)

Instead of configuring LLM/TTS/ASR inline, you can reference an [Agent Builder](https://console.agora.io) pipeline. When `PIPELINE_ID` is set, the backend sends a minimal payload and Agora resolves all STT/TTS/LLM config from the pipeline. **No LLM API key, TTS key, or ASR config is needed** — only Agora credentials and the pipeline ID.

```bash
# Pipeline mode — only 3 values required (no LLM/TTS/ASR keys needed)
VOICE_APP_ID=your_app_id
VOICE_APP_CERTIFICATE=your_app_certificate
VOICE_PIPELINE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

The `pipeline_id` query parameter overrides the env var:

```bash
curl "http://localhost:8082/start-agent?channel=test&pipeline_id=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Profile Overrides

Both clients have a "Server Profile" field to override the default profile. Leave empty to use defaults (`VOICE` for voice client, `VIDEO` for video client).

**Profile names are case-insensitive** - the server normalizes all profile names to lowercase, so `VOICE`, `voice`, or `Voice` all work identically.

### For AI Coding Assistants

When setting up the `.env` file:

- Voice client requires `VOICE_*` prefixed variables
- Video client requires `VIDEO_*` prefixed variables

Documentation may show simplified variable names for readability, but always use the full prefix.

### Debug Settings

When curl dump is enabled (`VOICE_ENABLE_CURL_DUMP=true` or `VIDEO_ENABLE_CURL_DUMP=true`), the backend writes timestamped shell scripts to `/tmp/`:

- Format: `agora_curl_<profile>_YYYYMMDD_HHMMSS.sh`
- Examples: `agora_curl_voice_20260120_143022.sh`, `agora_curl_video_20260120_143045.sh`

This is useful for debugging API requests. The curl dump includes full request headers and payload.

**Viewing logs:** The backend logs agent IDs and API response status to stdout. To see them reliably:

```bash
# Always use -u for unbuffered output
python3 -u local_server.py

# View most recent curl dump
ls -lt /tmp/agora_curl_*.sh | head -1

# Check agent ID and response status in logs
# Look for lines like:
#   Response status: 200
#   Response body: {"agent_id":"A42A...","create_ts":...,"status":"RUNNING"}
```

> **Gotcha:** Without `-u`, Python buffers stdout. Agent IDs and API responses will be silently buffered and may never appear in log files or process managers (PM2, systemd, etc.). Always start the backend with `python3 -u` or set `PYTHONUNBUFFERED=1`.

## Usage

**Start agent:**

```bash
curl "http://localhost:8082/start-agent?channel=test"
```

**Start agent with profile:**

```bash
curl "http://localhost:8082/start-agent?channel=test&profile=VIDEO"
```

**Stop agent:**

```bash
curl "http://localhost:8082/hangup-agent?agent_id=abc123"
```

### Speak (Push Text to Agent TTS)

```bash
curl -X POST http://localhost:8082/speak \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "abc123", "text": "Hello world!", "priority": "APPEND"}'
```

The `/speak` endpoint pushes text directly to a running agent's TTS pipeline via the [Agora Speak API](https://docs.agora.io/en/conversational-ai/rest-api/agent/speak). This bypasses the LLM — the agent speaks the exact text provided.

| Parameter  | Required | Description |
|------------|----------|-------------|
| `agent_id` | Yes      | The agent ID (returned by `/start-agent`) |
| `text`     | Yes      | Text for the agent to speak |
| `priority` | No       | `"APPEND"` (default) queues after current speech. `"INTERRUPT"` cuts off current speech immediately. |
| `profile`  | No       | Profile for auth credentials (default: `"video"`) |

**Health check:**

```bash
curl "http://localhost:8082/health"
```

### URL Query Parameters for `/start-agent`

| Param | Effect |
| --- | --- |
| `profile` | Which `{PROFILE}_*` env block to use. |
| `channel` | RTC channel name; auto-generated if omitted. |
| `connect=false` | Token-only mode — skip ConvoAI `/join` and skip `xhandle` resolution. |
| `prompt`, `greeting` | Override `{PROFILE}_DEFAULT_PROMPT` / `{PROFILE}_DEFAULT_GREETING`. |
| `voice_id` | Override TTS voice. In MLLM mode (xai/openai/vertexai), also overrides `mllm.params.voice`. |
| `avatar_id` | Override `{PROFILE}_AVATAR_ID`. For the `generic` avatar vendor (e.g. LemonSlice), this is the public image URL — URL-encode it when embedding. |
| `xhandle` | Public X (Twitter) handle. Backend calls X API v2 to generate a persona system prompt, a first-person greeting, and (when applicable) an avatar image. Replaces the profile's default prompt. On X API error, silently falls back to the profile default. Skipped on `connect=false`. Requires `X_API_BEARER_TOKEN` env var. |
| `turn_detection_mode` | xAI only. `agora_vad` (default) or `server_vad`. Emitted under `mllm.turn_detection`. |
| `turn_detection_threshold`, `turn_detection_prefix_padding_ms`, `turn_detection_silence_duration_ms`, `turn_detection_interrupt_duration_ms` | xAI tunables. Defaults match [Agora's xAI docs](https://docs.agora.io/en/conversational-ai/models/mllm/xai). |
| `tts_language` | ElevenLabs only. ISO 639-1 code (`en`, `es`, etc.) sent as `language_code` so flash_v2_5 / turbo_v2_5 won't auto-detect and switch languages mid-response. Defaults to `{PROFILE}_TTS_LANGUAGE`, then the first two chars of `ASR_LANGUAGE`. |
| `debug=true` | Include `agent_payload` (with sensitive fields redacted client-side) in the response so clients can show resolved prompt/greeting. |

**API Documentation:**

- [Start agent REST API](https://docs.agora.io/en/conversational-ai/rest-api/agent/join)
- [Stop agent REST API](https://docs.agora.io/en/conversational-ai/rest-api/agent/leave)
- [Speak REST API](https://docs.agora.io/en/conversational-ai/rest-api/agent/speak)

## Running Tests

```bash
# Run all tests
pytest

# With coverage
pytest --cov=core --cov-report=term-missing

# Verbose
pytest -v
```

## AWS Lambda Deployment

**1. Package:**

```bash
zip -r lambda.zip lambda_handler.py core/
```

**2. Upload to AWS Lambda**

**3. Set environment variables** (same as `.env` format above)

**4. Configure API Gateway trigger**

## Agent Payload Behavior

The backend builds the Agora ConvoAI agent payload in `core/agent.py`. Key sections:

### Advanced Features

| Feature        | Default     | Description                                                                                                                                     |
| -------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `enable_rtm`   | `true`      | Always enabled. Required for RTM messaging between client and agent.                                                                            |
| `enable_sal`   | `false`     | Selective Attention Locking (beta). Blocks ~95% of ambient voices so the agent focuses on the primary speaker. Set `ENABLE_SAL=true` to enable. |
| `enable_mllm`  | `false`     | Enables multimodal LLM mode (Gemini Live or OpenAI Realtime). Set `ENABLE_MLLM=true` to enable.                                                 |
| `enable_tools` | conditional | Automatically enabled when MCP servers are configured.                                                                                          |
| Call duration cap | `300` (sec) | Wall-clock max session length. Backend schedules an auto-hangup at `MAX_CALL_DURATION_SECONDS` (profile-overridable); manual `/hangup-agent` cancels the timer. Clients auto-clean up when the agent's RTC user leaves the channel. |

### Turn Detection

Turn detection controls how the agent detects when the user has finished speaking.

```json
"turn_detection": {
  "config": {
    "end_of_speech": {
      "mode": "semantic"
    }
  }
}
```

| Setting            | Env Var                   | Default               | Description                                                                                                                     |
| ------------------ | ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| End-of-speech mode | `ENABLE_AIVAD`            | `true` → `"semantic"` | `"semantic"` uses AI-based end-of-speech detection. Set `ENABLE_AIVAD=false` for basic `"vad"` mode.                            |
| Silence duration   | `VAD_SILENCE_DURATION_MS` | _(omitted)_           | Only included when explicitly set in `.env`. Controls ms of silence before end-of-speech triggers. Omit to use server defaults. |

In MLLM mode, `turn_detection` also includes a top-level `mode` field (defaults to `"server_vad"`, configurable via `TURN_DETECTION_TYPE`).

**xAI MLLM (`mllm_vendor=xai`):** the top-level `turn_detection` block is ignored by ConvoAI. Configuration goes under `mllm.turn_detection` instead, in the shape `{ "mode": "agora_vad" | "server_vad", "<mode>_config": { ... } }`. Backend emits this automatically with docs-default values and exposes URL params `turn_detection_mode`, `turn_detection_threshold`, `turn_detection_prefix_padding_ms`, `turn_detection_silence_duration_ms`, `turn_detection_interrupt_duration_ms` for runtime tuning / latency A/B. See [docs/ai/L1/L2/xai_profile.md](../docs/ai/L1/L2/xai_profile.md) for the full xAI profile contract.

### Parameters

```json
"parameters": {
  "transcript": { "enable": true, "protocol_version": "v2", "enable_words": false },
  "enable_dump": true
}
```

| Setting          | Env Var               | Default                 | Description                                                                                     |
| ---------------- | --------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `transcript`     | —                     | enabled (non-MLLM only) | Enables transcript protocol v2 for real-time captions. Only included in standard TTS+LLM mode.  |
| `enable_dump`    | —                     | `true`                  | Always enabled. Enables server-side request logging.                                            |
| `audio_scenario` | `ENABLE_AUDIO_CHORUS` | _(omitted)_             | Set `ENABLE_AUDIO_CHORUS=true` to add `"audio_scenario": "chorus"` for multi-speaker scenarios. |

### Authentication

The backend supports two authentication methods for the Agora ConvoAI API:

1. **v007 token (recommended):** Set `APP_ID` and `APP_CERTIFICATE`. The backend auto-generates a v007 token and sends `Authorization: agora token=<token>`.
2. **REST API key:** Set `AGENT_AUTH_HEADER` to `Basic <base64(customer_id:customer_secret)>` from the [Agora Console](https://console.agora.io) REST API key page. Only needed when `APP_CERTIFICATE` is not available.

### Pipeline Mode Payload

When `pipeline_id` is set (via env var or query param), the backend sends a minimal payload:

```json
{
  "name": "channel_name",
  "pipeline_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "properties": {
    "channel": "channel_name",
    "token": "007eJx...",
    "agent_rtc_uid": 100,
    "agent_rtm_uid": "...",
    "remote_rtc_uids": ["*"]
  },
  "overrides": {
    "llm": {
      "system_messages": [{ "role": "system", "content": "..." }],
      "greeting_message": "Hello!"
    }
  }
}
```

The pipeline payload has **no** `advanced_features`, `llm`, `tts`, `asr`, `parameters`, or `turn_detection` sections. Only `prompt` and `greeting` are passed as optional overrides — the pipeline owns all other config. Avatar config is still sent separately when configured.

## Advanced Configuration

See `.env.example` for all available settings including:

- ASR vendor options (Ares, Deepgram)
- VAD settings
- Vendor-specific TTS models
- Avatar quality settings
- Debug options

## Architecture

```
simple-backend/
├── core/              # Shared business logic
│   ├── config.py     # Environment variables & profiles
│   ├── tokens.py     # Token generation
│   ├── agent.py      # Agent API calls (create, speak, hangup)
│   └── utils.py      # Utilities
├── lambda_handler.py # AWS Lambda wrapper
├── local_server.py   # Flask development server
└── .env              # Local config (gitignored)
```

## Custom LLM Server (Optional)

A Custom LLM server sits between Agora ConvoAI and your LLM provider, giving you full control over prompts, RAG, tool calling, and response formatting.

See: [server-custom-llm](https://github.com/AgoraIO-Conversational-AI/server-custom-llm)

**Configuration:** Set `LLM_URL` to your custom server endpoint and `LLM_VENDOR=custom` in `.env`:

```bash
VOICE_LLM_URL=https://your-custom-llm.example.com/chat/completions
VOICE_LLM_API_KEY=your-openai-key
VOICE_LLM_VENDOR=custom
VOICE_LLM_STYLE=openai
```

The custom server proxies requests to your LLM provider and supports endpoints for basic chat (`/chat/completions`), RAG-enhanced chat (`/rag/chat/completions`), and multimodal audio (`/audio/chat/completions`).

## Authentication + Session Memory (Optional)

Optional Google OAuth + SMS 2FA authentication with encrypted per-user session memory for use cases like AI therapy where conversation history must be protected and persistent.

See: [auth.md](auth.md) for full design plan and implementation details.

## MCP Memory Server (Optional)

An MCP memory server gives agents persistent per-user memory via tool calling, allowing the agent to remember context across conversations.

See: [server-mcp](https://github.com/AgoraIO-Conversational-AI/server-mcp)

**Configuration:** Set `MCP_SERVERS` as a JSON array in `.env`:

```bash
VOICE_MCP_SERVERS=[{"name":"memory","endpoint":"https://your-mcp-server.example.com/mcp","transport":"streamable_http","allowed_tools":["*"]}]
```

The MCP server must be publicly accessible. For local development, use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) to expose your local server.
