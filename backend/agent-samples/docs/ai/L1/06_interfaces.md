# 06 Interfaces

> Boundary contracts for the backend endpoints and profile-driven behavior.

## Key Backend Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /start-agent` | start agent or return token-only response |
| `GET /hangup-agent` | stop a running agent |
| `POST /speak` | push direct TTS text to a running agent |
| `POST /join-meeting` | authorize and mint meeting credentials |
| `POST /meeting-participant-event` | notify meeting participant state |
| `POST /upload-photo` | accept a phone-camera JPEG, run face vision + voice pick + square crop, write to `/uploads/<profile>/<id>.jpg` plus a sidecar JSON. Used by the `/photo` demo. |
| `GET /photos?profile=<P>&limit=N` | list recent uploads for a photo-demo profile (newest first); falls back to a curated seed if the profile dir is empty. |
| `GET /photo/<id>?profile=<P>` | one photo's sidecar metadata. |
| `DELETE /photo/<id>?profile=<P>` | remove an upload (image + sidecar). |
| `GET /photo-latest?profile=<P>` | shortcut for the most recent upload. |
| `POST /news/join` | viewer joins a shared-channel `/news` session. First joiner starts the agent + a background reader thread; subsequent joiners reuse. Returns Agora subscriber token (no publish privileges) + `agent_id` + `session_id`. Reads `?channel=` + `?profile=` (default `news-default` / `news`). |
| `POST /news/heartbeat` | viewer keep-alive; server drops sessions with no heartbeat for 60 s. |
| `POST /news/leave` | viewer leaves; last-leaver-out tears down the agent + reader. |
| `GET /news/status` | operator dump: which channels are running, how many viewers, what was last spoken. |

## Generic Avatar / TTS Knobs

| Env (profile-prefixed) | Effect |
| --- | --- |
| `AVATAR_BACKGROUND_COLOR` | Hex fill the generic LemonSlice renderer composites the avatar against (e.g. `#006400`). Client can chroma-key it out for transparency. Only added to the wire payload when set. |
| `AVATAR_ASPECT_RATIO` | Hint passed to LemonSlice (e.g. `1x1` square). Only added when set. |
| `ELEVENLABS_SPEED` | Speech rate (0.7 slow … 1.2 fast). Only added when set; otherwise the model uses its default. |

## Common URL Parameters for `/start-agent`

| Param | Effect | Defined in |
| --- | --- | --- |
| `profile` | Selects which `{PROFILE}_*` env vars to use. Defaults vary per client. | `core/config.py` |
| `channel` | RTC channel name. Auto-generated if omitted. | `local_server.py` |
| `connect=false` | Token-only mode — generate tokens, skip ConvoAI `/join` and xhandle resolution. | `local_server.py` |
| `prompt`, `greeting` | Override profile `DEFAULT_PROMPT` / `DEFAULT_GREETING`. | `core/agent.py` |
| `voice_id` | Overrides TTS voice or, in MLLM mode, `mllm.params.voice`. | `core/agent.py` |
| `avatar_id` | Overrides `{PROFILE}_AVATAR_ID`. | `core/agent.py` |
| `xhandle` | Generates persona prompt + greeting (+ avatar image, where applicable) from a public X handle. Replaces the profile default prompt. Skipped on `connect=false`. Falls back to profile defaults on X API error. | `x/profile_prompt.py` |
| `turn_detection_mode` | xAI only: `server_vad` (default — matches xAI's native behavior) or `agora_vad`. Emitted under `mllm.turn_detection`. | `core/agent.py` |
| `turn_detection_threshold` / `_prefix_padding_ms` / `_silence_duration_ms` / `_interrupt_duration_ms` | xAI tunables; defaults match Agora's xAI docs. | `core/agent.py` |
| `tts_language` | ElevenLabs only: ISO 639-1 code sent as `language_code` to flash_v2_5 / turbo_v2_5. Locks TTS pronunciation rules to one language so the model doesn't auto-detect and switch mid-response. Defaults to `TTS_LANGUAGE` env, then the first two chars of `ASR_LANGUAGE` (e.g. `en-US` → `en`). | `core/agent.py` |

## Profile-Level Behavior

| Env (profile-prefixed) | Default | Effect |
| --- | --- | --- |
| `IDLE_TIMEOUT` | `120` | Seconds of inactivity before ConvoAI ends the call internally. |
| `MAX_CALL_DURATION_SECONDS` | `300` | Wall-clock cap. Backend schedules an auto-hangup at this time; cancelled by manual `/hangup-agent`. Server-initiated hangups cause the client's RTC `user-left` event to fire `handleStop`. |
| `ENABLE_CURL_DUMP` | `false` | When `true`, every `/start-agent` writes a replayable curl script to `/tmp/agora_curl_<profile>_<timestamp>.sh`. |

## Contract Patterns

- profile selected by query param or client default
- backend returns channel/token/RTM details plus feature flags
- backend response includes `debug.agent_payload` when `debug=true` is set (clients use this to surface resolved prompt + greeting in `SessionInfoPanel`); sensitive fields are redacted client-side via `redactSensitiveFields()` before display
- meeting mode contracts depend on consultant-dashboard internal APIs

## Related Deep Dives

- [therapy_profile](L2/therapy_profile.md) — therapy / biomarker / dashboard-backed sample stack
- [xai_profile](L2/xai_profile.md) — xAI Grok Realtime profiles (XLS / X), xhandle persona, xAI turn detection
