# 01 Setup

> Environment setup, local run commands, and the minimum stack needed for common sample flows.

## Prerequisites

- Python 3 for `simple-backend`
- Node.js for React clients
- Agora credentials for real agent startup
- optional public tunnel when using a local custom LLM server

## Common Local Services

- backend: `simple-backend` on `:8082`
- voice client: `react-voice-client`
- video client: `react-video-client-avatar`

## Quick Commands

| Command | What it does |
| --- | --- |
| `cd simple-backend && pip3 install -r requirements-local.txt` | install backend deps |
| `cd simple-backend && python3 -u local_server.py` | start backend with unbuffered logs |
| `cd react-voice-client && npm install && npm run dev` | start voice client |
| `cd react-video-client-avatar && npm install && npm run dev` | start video client |

## Configuration Shape

- backend config is profile-prefixed: `VOICE_*`, `VIDEO_*`, or custom profile names
- clients pass `profile=` to select a backend profile
- custom LLM usage is config-driven through `LLM_URL`, `LLM_VENDOR=custom`, `LLM_STYLE=openai`

## Related Deep Dives

- [therapy_profile](L2/therapy_profile.md) — therapy / biomarker / dashboard-backed sample stack
