# 03 Code Map

> Directory map and fast guidance on where common sample-stack behavior lives.

## Key Directories

| Path | Role |
| --- | --- |
| `simple-backend/` | Python backend, token generation, agent start/stop, auth helpers |
| `react-voice-client/` | primary voice web client |
| `react-video-client-avatar/` | avatar/video web client, meeting UI |
| `simple-voice-client-no-backend/` | static demo client |
| `simple-voice-client-with-backend/` | plain JS client using backend |
| `recipes/` | scenario-focused setup docs |

## Important Backend Files

- `simple-backend/local_server.py` — main Flask app and endpoints (token gen, agent start/stop, photo upload, `/news` lifecycle, `/speak`).
- `simple-backend/core/auth.py` — shared client auth/session logic.
- `simple-backend/core/meeting_mode.py` — meeting join/end helpers.
- `simple-backend/core/consultant_dashboard.py` — dashboard integration helpers.
- `simple-backend/core/agent.py` — ConvoAI agent payload builder. Avatar params now include the generic `AVATAR_BACKGROUND_COLOR` (chroma key), `AVATAR_ASPECT_RATIO`, and `ELEVENLABS_SPEED` knobs — all conditional, so profiles that don't set them keep renderer defaults.
- `simple-backend/core/config.py` — env-var whitelist + profile resolution. New entries: `AVATAR_BACKGROUND_COLOR`, `AVATAR_ASPECT_RATIO`, `ELEVENLABS_SPEED`.
- `simple-backend/core/news_channel.py` — per-channel lifecycle + reader thread for the `/news` shared-channel demo. First viewer to `POST /news/join` spins a ConvoAI agent + background reader; last viewer (or a 60 s no-heartbeat sweep) tears it down. Adopts a still-running ConvoAI agent on `TaskConflict` so a backend restart doesn't kill the channel for connected viewers.
- `simple-backend/core/news_feed.py` — RSS / Hacker News / X aggregator for `/news`. Round-robin interleaved across 9 sources (BBC World, Guardian, NPR, Al Jazeera, HN top, The Verge, TechCrunch, Ars Technica, curated X handles). Per-channel dedup with a 5 min reread cooldown. `speak_text_for(item)` composes `"From BBC: <headline>. <lede>."` lines with engagement signals for HN ("Trending on Hacker News with N points and M comments") and attribution for X ("On X, Sam Altman writes…").
- `simple-backend/photo/` — upload pipeline for the `/photo` demo: `vision.py` (gpt-4o-mini image → sex + age bucket + bbox), `voices.py` (curated ElevenLabs / Gemini voice catalog mapped from sex + age), `crop.py` (PIL square crop centred on detected face). Wired into `local_server.py` via `/upload-photo`, `/photos`, `/photo/<id>`, `/photo-latest`.

## Related Deep Dives

- [therapy_profile](L2/therapy_profile.md) — specific therapy stack layout across repos
