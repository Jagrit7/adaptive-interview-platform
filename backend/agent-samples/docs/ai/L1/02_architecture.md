# 02 Architecture

> System design at a glance for the sample stack.

## Main Components

- `simple-backend` generates Agora credentials and starts/stops agents
- React clients join RTC/RTM and render transcripts, chat, and avatar/video
- optional custom LLM server intercepts LLM traffic for tools, RAG, memory, biomarkers

## Core Flow

1. client calls `simple-backend`
2. backend generates tokens and sends Agora agent start request
3. client and agent join the same channel
4. optional custom LLM handles `/chat/completions`

## Sample Modes

- standard AI session
- human meeting mode with dashboard authorization
- therapist/wellness profile with Thymia/Shen/custom-LLM integrations
- **photo-avatar upload pipeline** — phone-camera JPEG → vision (sex/age) → voice pick → square crop → per-profile gallery → talk-to-your-photo via LemonSlice. See `simple-backend/photo/`.
- **`/news` shared-channel viewer** — one LemonSlice avatar reads rolling news + X commentary to many viewers in the same Agora channel. Speech is pushed exclusively via Agora's `/speak` REST endpoint; viewers never publish a mic track. First viewer to `POST /news/join` spins the agent + a background reader thread; last viewer (or a 60 s no-heartbeat sweep) tears it down. Adopts a still-running agent on `TaskConflict` so a backend restart doesn't kill the channel for connected viewers. See `core/news_channel.py` + `core/news_feed.py`.

## Related Deep Dives

- [therapy_profile](L2/therapy_profile.md) — therapy-oriented stack and biomarker flow
