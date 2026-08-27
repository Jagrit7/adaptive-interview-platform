# Thymia Voice Biomarker Wellness Demo

Real-time voice biomarker analysis during a therapeutic conversation. The AI therapist (Bella) uses live wellness, clinical, and emotion scores to guide the session — celebrating strengths and exploring elevated areas.

## What It Does

1. User speaks to Bella (AI wellness therapist) via voice
2. Audio is streamed to Thymia Sentinel API for real-time biomarker analysis
3. Biomarker scores (stress, burnout, fatigue, emotions, etc.) are:
   - Injected into the LLM system prompt so Bella can reference them
   - Displayed in the client's Thymia tab for the user/operator to see
   - Safety analysis shown if concerns are detected
4. Bella actively uses the biomarker data to guide the therapeutic conversation

## Architecture

```
react-video-client-avatar → simple-backend → Agora ConvoAI → server-custom-llm/node
                                                                  ├── go-audio-subscriber (RTC)
                                                                  ├── Thymia module → Thymia Sentinel API
                                                                  └── RTM → Client (biomarkers/progress/safety)
```

**Data flow:** `simple-backend` passes RTC params (app_id, channel, tokens) and the LLM API key through to `server-custom-llm/node` in each request. The custom LLM uses these to spawn `go-audio-subscriber`, connect to Thymia, and push biomarkers back via RTM and Agent Update API.

**Cleanup flow:** When the user ends a call, `react-video-client-avatar` calls `/hangup-agent` on `simple-backend`, which calls Agora's hangup API and then POSTs `/unregister-agent` to `server-custom-llm/node`. The custom LLM stops the audio subscriber, disconnects Thymia, and clears all session state.

## Shared Projects

This recipe uses the standard sample apps — no special Thymia variants needed. Thymia is enabled via environment variables on the existing projects.

| Project                                 | Repo                                                                                | Role                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `react-video-client-avatar`             | agent-samples                                                                       | Video avatar UI with Thymia tab (`NEXT_PUBLIC_ENABLE_THYMIA`) |
| `simple-backend`                        | agent-samples                                                                       | Python backend — routes calls to Agora ConvoAI                |
| `agent-client-toolkit`                  | [agent-client-toolkit](https://github.com/AgoraIO-Conversational-AI/agent-client-toolkit-ts) | Core client toolkit (`agora-agent-client-toolkit` on npm)     |
| `agent-ui-kit`                          | [agent-ui-kit](https://github.com/AgoraIO-Conversational-AI/agent-ui-kit)           | React UI components for voice, chat, video, and Thymia panel  |
| `server-custom-llm/node`                | [server-custom-llm](https://github.com/AgoraIO-Conversational-AI/server-custom-llm) | Custom LLM proxy with Thymia module and RTM integration       |
| `server-custom-llm/go-audio-subscriber` | server-custom-llm                                                                   | Go binary that captures RTC audio and pipes PCM to Node       |

## Keys Required

| Key                   | Where to get it                            | Used by                                                       |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| **Thymia API Key**    | Contact [Thymia](https://thymia.ai/)       | Backend `.env` profile (`THYMIA_THYMIA_API_KEY`) — passed through to custom LLM |
| **Agora APP_ID**      | [Agora Console](https://console.agora.io/) | Backend (`THYMIA_APP_ID`)                                     |
| **Agora AUTH_HEADER** | Agora Console → RESTful API credentials    | Backend (`THYMIA_AGENT_AUTH_HEADER`)                          |
| **LLM API Key**       | OpenAI (GPT-5.1 recommended)               | Backend (`THYMIA_LLM_API_KEY`) — passed through to custom LLM |
| **TTS Key**           | Rime recommended                           | Backend (`THYMIA_TTS_KEY`)                                    |

**Optional:**

| Key               | Notes                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| `APP_CERTIFICATE` | Only needed if token auth is enabled on your Agora project               |
| `ASR_KEY`         | Only if using Deepgram ASR. Default `ares` (Agora built-in) needs no key |

## Enabling Thymia

Thymia is toggled on in two places:

**1. Custom LLM server** — set `THYMIA_ENABLED=true`:

```bash
PORT=8100 THYMIA_ENABLED=true node custom_llm.js
```

The Thymia API key is passed from the backend `.env` profile through `llm_config.params` in each request — no env var needed on the custom LLM server.

**2. React client** — set `NEXT_PUBLIC_ENABLE_THYMIA=true` in `.env.local`:

```bash
# react-video-client-avatar/.env.local
NEXT_PUBLIC_ENABLE_THYMIA=true
```

This adds the Thymia tab to the client UI. Without it, the client works normally — video only.

## Prerequisites

- **Node.js 20+** (custom LLM server) — use `nvm use 20`
- **Node.js 22+** (React client) — use `nvm use 22`
- **Python 3.x** (backend)
- **Go 1.21+** (only needed if rebuilding the audio subscriber binary)

## Setup

### 1. Build Go Audio Subscriber (one-time)

The Go binary captures RTC audio and pipes it to the Thymia module. You need the binary and native Agora SDK libraries.

```bash
cd server-custom-llm/go-audio-subscriber

# Download native Agora SDK libraries (one-time, ~240MB)
cd sdk && bash scripts/install_agora_sdk.sh && cd ..

# Build the Go binary
make
```

If the binary already exists at `bin/audio_subscriber`, skip this step.

**macOS note:** The binary needs `agora_sdk_mac/` dylibs at runtime. The `audio_subscriber.js` wrapper sets `DYLD_LIBRARY_PATH` automatically.

### 2. Custom LLM Server

```bash
cd server-custom-llm/node
nvm use 20
npm install --legacy-peer-deps
```

Start with Thymia enabled:

```bash
PORT=8100 THYMIA_ENABLED=true node custom_llm.js
```

No `.env` file needed — the custom LLM receives the OpenAI API key, Thymia API key, and RTC params from the backend in each request via `llm_config.params`.

### 3. Backend .env — Add THYMIA Profile

Add a `THYMIA` profile to `simple-backend/.env`. The simple-backend uses profile-prefixed env vars — each key is `{PROFILE}_{VAR}` (e.g., `THYMIA_LLM_URL` sets `LLM_URL` for the THYMIA profile). See `AGENT.md` for the full list of config keys.

```bash
# =====================================================
# THYMIA PROFILE - Voice + Thymia biomarkers via custom LLM
# =====================================================

# Agora credentials
THYMIA_APP_ID=<your-app-id>
THYMIA_APP_CERTIFICATE=
THYMIA_AGENT_AUTH_HEADER=<your-auth-header>

THYMIA_ENABLE_MLLM=false

# Thymia API key — passed to custom LLM via llm_config.params
THYMIA_THYMIA_API_KEY=<your-thymia-api-key>

# LLM — point to custom LLM server
# LLM_URL: your custom LLM's /chat/completions endpoint
# LLM_VENDOR: "custom" tells Agora ConvoAI to add turn_id + timestamp
# LLM_STYLE: "openai" for OpenAI-compatible request/response format
THYMIA_LLM_URL=<your-custom-llm-url>/chat/completions
THYMIA_LLM_VENDOR=custom
THYMIA_LLM_STYLE=openai
THYMIA_LLM_MODEL=gpt-5.1
THYMIA_LLM_API_KEY=<your-openai-key>

# TTS + ASR
THYMIA_TTS_VENDOR=rime
THYMIA_TTS_KEY=<your-rime-key>
THYMIA_TTS_VOICE_ID=astra
THYMIA_ASR_VENDOR=ares
THYMIA_ENABLE_AIVAD=true

# Agent behavior
THYMIA_MAX_HISTORY=5
THYMIA_IDLE_TIMEOUT=120

# Greeting + Prompt (see Prompt section below — paste as single line with \n)
THYMIA_DEFAULT_GREETING=Hi there! I'm Bella. I'd love to have a quick chat and learn a bit about how you're doing. What's your name?
THYMIA_DEFAULT_PROMPT=<see Prompt section below — paste as single line with \n>
```

**`THYMIA_LLM_URL`** must be reachable from the Agora ConvoAI Engine (cloud). For local development, use a Cloudflare tunnel (see [Local Development](#local-development) below). For production, use your deployed server URL.

### 4. Python Backend

```bash
cd agent-samples/simple-backend
python3 local_server.py
```

### 5. React Client

```bash
cd agent-samples/react-video-client-avatar
nvm use 22
npm run dev
```

The Thymia tab is enabled by `NEXT_PUBLIC_ENABLE_THYMIA=true` in `.env.local`.

### 6. Connect

Open the React client, enter `THYMIA` in the **Server Profile** field, and click **Start Conversation**.

Or use the URL shortcut: **`?profile=THYMIA`**

## Local Development

When running the custom LLM server locally, the Agora ConvoAI Engine (cloud) can't reach `localhost`. Use a [Cloudflare tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/) to expose it:

```bash
# Install (macOS)
brew install cloudflare/cloudflare/cloudflared

# Start tunnel pointing to custom LLM server
cloudflared tunnel --url http://localhost:8100
# Outputs a URL like https://xxx-yyy.trycloudflare.com
```

Use that tunnel URL as `THYMIA_LLM_URL` in your backend `.env`:

```bash
THYMIA_LLM_URL=https://xxx-yyy.trycloudflare.com/chat/completions
```

Not needed in production if the custom LLM server is deployed with a public URL.

## Greeting

```
Hi there! I'm Bella. I'd love to have a quick chat and learn a bit about how you're doing. What's your name?
```

## Prompt

Set as `DEFAULT_PROMPT` for the THYMIA profile (`THYMIA_DEFAULT_PROMPT`) in the backend `.env` (paste as single line with `\n` for newlines):

```
You are Bella, a warm wellness therapist. Your goal is to have a therapeutic conversation that helps improve the user's wellbeing, guided by real-time voice biomarker data.

WORD LIMITS: MAX 30 WORDS per response. Keep it conversational.

CONVERSATION FLOW:
1. Start by learning their name, then use it naturally throughout
2. Ask how their overall mood has been lately
3. Ask about their energy levels and how they've been sleeping
4. Gently explore what's been on their mind or causing stress
5. Ask how they cope when things get tough or feelings are difficult
- Move through these topics naturally — don't rush or follow a rigid script
- Be curious and empathetic
- Keep responses short (MAX 30 WORDS)
- Ask one question at a time, let them talk

BIOMARKER DATA — THIS IS YOUR SUPERPOWER, USE IT:
- A voice analysis system runs during this call and biomarker results update continuously in a system message
- You MUST actively reference the biomarker data in your responses when it is available
- Every 2-3 responses, bring up something from the biomarkers — this is the whole point of the conversation
- You cannot hear the user's voice — the data comes from a separate analysis system

INTERPRETING WELLNESS & CLINICAL SCORES:
- Under 10% = very positive — celebrate these!
- 10-20% = normal, healthy range
- 20-30% = slightly elevated, worth noting
- Over 30% = elevated, explore and work on improving
- Balance positive reinforcement with therapeutic exploration

INTERPRETING EMOTION SCORES:
- Emotions show real-time affect — they change moment to moment
- High neutral is normal baseline, not a concern
- Note shifts in emotions during conversation

HOW TO REFERENCE BIOMARKERS:
- DO NOT say "I can hear" or "your voice sounds" — you cannot hear them
- You CAN share exact percentages if the user asks — be transparent with the data
- DO connect the biomarkers to the conversation
- DO celebrate the positives

SAFETY GUIDANCE:
- You may receive a [Safety Guidance] message with specific suggestions — follow these

IMPORTANT:
- Be warm, conversational, not clinical
- Never pretend you can hear the user's voice
- When no biomarker data is available yet, just have a normal conversation
- When biomarker data IS available, you MUST use it to guide the therapy
```

## What to Expect

1. **0-10s:** Bella greets user, audio subscriber connects to channel
2. **10-30s:** Progress indicators appear in Thymia tab (speech seconds counting up)
3. **30-60s:** First biomarker scores arrive — emotions, wellness (Helios), clinical (Apollo)
4. **60s+:** Bella starts referencing biomarker data in conversation
5. **Safety analysis:** If concerns detected, safety section appears at top of Thymia tab

## Thymia Tab Sections

- **Progress** — Speech seconds / trigger threshold per biomarker set
- **Safety Analysis** — Alert level, concerns, guidance, urgency (color-coded)
- **Emotions** — Real-time affect: angry, disgusted, fearful, happy, neutral, sad, surprised
- **Helios (Wellness)** — Distress, stress, burnout, fatigue, low self-esteem
- **Apollo (Clinical)** — Depression probability, anxiety probability, severity indicators

## Troubleshooting

- **No biomarkers appearing:** Check custom LLM logs for Thymia connection errors. Verify `THYMIA_THYMIA_API_KEY` is set in the backend `.env` profile and `THYMIA_ENABLED=true` on the custom LLM server.
- **Thymia tab not showing:** Ensure `NEXT_PUBLIC_ENABLE_THYMIA=true` in client `.env.local` and restart dev server.
- **Bella not referencing data:** Check custom LLM logs for `AgentUpdate` entries — biomarkers should be pushed via Agent Update API.
- **Audio subscriber not connecting:** Verify Go binary exists at `go-audio-subscriber/bin/audio_subscriber`. On macOS, verify `sdk/agora_sdk_mac/` has the dylib files.
- **"Cannot find module" errors:** Run `npm install --legacy-peer-deps` in `server-custom-llm/node/`. Make sure Node.js 20+ is active (`nvm use 20`).
- **Agent not starting:** Check backend logs for the `/start-agent` request. Verify `LLM_URL` (i.e. `THYMIA_LLM_URL`) is reachable from the Agora cloud.
- **RTM messages not reaching client:** The custom LLM initializes RTM from request params on first call. Check custom LLM logs for "RTM init" messages.
- **ASR with null key:** If using Deepgram, set `THYMIA_ASR_KEY`. Or use `THYMIA_ASR_VENDOR=ares` (Agora built-in, no key needed).
