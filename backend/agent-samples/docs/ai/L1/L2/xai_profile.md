# xAI MLLM Profiles (XLS / X)

> **When to Read This:** Working on or extending the xAI Grok Realtime profiles — XLS (avatar + voice) or X (voice-only) — including the `xhandle` persona feature and xAI turn-detection tuning.

## Scope

Two profile pairs share the same xAI Realtime backend:

- **XLS** — xAI MLLM + LemonSlice avatar (`avatar_vendor=generic`). Used by `react-video-client-avatar`.
- **X** — xAI MLLM, voice-only (no avatar). Used by `react-voice-client`.

Both go through `mllm_vendor=xai` in `simple-backend/core/agent.py` and connect to `wss://api.x.ai/v1/realtime` directly via ConvoAI — there is no custom-LLM intermediary.

## URL Parameters

All work on either client's page URL and are forwarded to `/start-agent`.

| Param | Effect |
| --- | --- |
| `profile` | Select XLS / X / any backend profile. |
| `xhandle` | Generate a persona prompt + greeting + (XLS only) avatar image from a public X handle. Replaces the profile's DEFAULT_PROMPT entirely; falls back to the profile default on X API error. |
| `voice_id` | Override `mllm.params.voice`. For xAI valid values include `eve`, `ara`, etc. |
| `avatar_id` | XLS only. Overrides `XLS_AVATAR_ID`. For LemonSlice, this is the public image URL (URL-encoded). |
| `turn_detection_mode` | `server_vad` (default — matches xAI's native behavior) or `agora_vad`. Drives `mllm.turn_detection`. |
| `turn_detection_threshold` | float, default `0.5`. |
| `turn_detection_prefix_padding_ms` | int. agora_vad default `800`; server_vad default `640`. |
| `turn_detection_silence_duration_ms` | int. agora_vad default `640`; server_vad default `900`. Lower = faster response. |
| `turn_detection_interrupt_duration_ms` | int, `agora_vad` only, default `160`. Min speech to trigger barge-in. |

## xAI Turn Detection Payload

For xAI MLLM the engine ignores top-level `properties.turn_detection`. Configuration goes under `mllm.turn_detection` instead:

```json
"mllm": {
  "vendor": "xai",
  "turn_detection": {
    "mode": "server_vad",
    "server_vad_config": {
      "threshold": 0.7,
      "prefix_padding_ms": 333,
      "silence_duration_ms": 200
    }
  }
}
```

Defaults tuned for faster response (lower `silence_duration_ms` than docs' 900) with a stricter VAD `threshold` (0.7 vs docs' 0.5) to suppress false speech-onset triggers.

See `build_mllm_config` in `core/agent.py`. Defaults match the docs at https://docs.agora.io/en/conversational-ai/models/mllm/xai.

## xhandle Persona

`x/profile_prompt.py` makes two X API v2 calls (~225ms total): `/users/by/username/{handle}` then `/users/{id}/tweets`. From the response it builds:

- a conversational system prompt (roleplay framing, identity, speaking style, top recent tweets as "views and recent statements")
- a short greeting in first person
- (XLS only) the user's `profile_image_url` is normalized to non-thumb size and used as `avatar_id`

The prompt **replaces** the profile's `DEFAULT_PROMPT`. It ends with a fixed conversation footer ("You can be heard and seen by the user. Keep responses under 20 words unless something more substantial is required.").

Tweet examples are ranked by `substance_score` (letter density minus hashtag/mention penalty plus length bonus) so promo fragments and tag soup are filtered out.

No caching today — each call hits the X API afresh. Token-only `/start-agent?connect=false` calls skip the X API path entirely.

## Configuration

Required env vars (per profile prefix):

```
XLS_APP_ID, XLS_APP_CERTIFICATE
XLS_ENABLE_MLLM=true
XLS_MLLM_VENDOR=xai
XLS_MLLM_URL=wss://api.x.ai/v1/realtime
XLS_MLLM_API_KEY=xai-...
XLS_MLLM_VOICE=eve
XLS_ASR_VENDOR=ares
XLS_AVATAR_VENDOR=generic               # XLS only
XLS_AVATAR_API_KEY=sk_lemon_...         # XLS only
XLS_AVATAR_API_BASE_URL=https://lemonslice.com/api/liveai/agora
XLS_AVATAR_ID=https://...               # default image
```

Plus one shared global for xhandle:

```
X_API_BEARER_TOKEN=...      # X (Twitter) API v2 bearer
X_API_TIMEOUT_SECONDS=8     # per X API call
```

## Known Hotspots

- **xAI silently rejects unknown payload fields**: legacy top-level `turn_detection: { config: { ..., mode: "semantic" } }` is ignored when `mllm.turn_detection` is set, but leaving it in the payload is noise. Source: `XLS_TURN_DETECTION_*` env vars in `.env`.
- **First-time LemonSlice avatar URL warm-up** is multi-second. Same image on a second call is faster — vendor-side warm cache.
- **xhandle "no bio" surprises**: X API v2 `description` field returns the *bio text only* — accounts with URL-only or empty bios show as "No bio available." This is accurate, not a bug. The LLM also has world knowledge of public figures which augments thin prompts.
- **Generated greeting may be ignored**: xAI Realtime treats `greeting_message` as a hint; once the model is generating it composes freely from the system prompt + world knowledge.

## Related Deep Dives

- `simple-backend/x/profile_prompt.py` — persona generator
- `simple-backend/core/agent.py::build_mllm_config` — xai vendor branch
- `react-video-client-avatar/components/SessionInfoPanel.tsx` — surfaces resolved greeting/prompt during a call
