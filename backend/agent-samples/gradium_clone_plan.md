# Gradium voice-clone plan

Adds `?audiopick=GRADIUM` to the `/photo?profile=GRADIUMDEMO` demo. Lets
visitors either (a) clone their own voice, (b) pick a previously cloned
voice from a gallery of the last 12, or (c) skip and keep the auto-picked
stock male/female. Once a voice_id is resolved, the flow continues into
`/photo-call` using that voice_id.

## Blocker before implementation

Need Gradium's voice-clone REST endpoint details:

1. **URL** — likely `https://api.gradium.ai/api/…` but confirm.
2. **Auth** — assumed `x-api-key: <TTS_KEY>` (same key as the TTS side).
3. **Request body** — multipart with `audio` field, or JSON with base64?
   Audio format required (WAV / MP3 / webm)? Any required `name`,
   `language`, `description` fields?
4. **Response body** — which JSON field carries the new `voice_id`
   (`voice_id`? `id`? `data.voice.id`?).
5. **Retention / pricing** — do clones expire? Cost per clone? Any
   throttle we should respect?

Working `curl` example from Gradium's docs is the fastest path.

## URL surface

| URL | Behaviour |
|---|---|
| `/photo?profile=GRADIUMDEMO` | Existing. Auto-picks stock male/female Gradium voice from `meta.sex`. |
| `/photo?profile=GRADIUMDEMO&audiopick=GRADIUM` | New. Adds a voice-picker step after photo upload. |

`audiopick` is a frontend-only concern (routes the flow, doesn't reach
the backend as a first-class field).

## Voice sidecar layout — mirrors the photos layout

```
/home/ubuntu/web/uploads/GRADIUMDEMO/voices/
   2026-07-03-101412.json    metadata sidecar
   2026-07-03-101412.wav     original 3-8s recording (for preview + label)
```

Slug format: `YYYY-MM-DD-HHMMSS`. Both the URL id and the display label
("2026-07-03 10:14:12"). Sortable filenames; unique per second; matches
the operator's ask to skip random slugs.

Sidecar JSON:

```json
{
  "id": "2026-07-03-101412",
  "voice_id": "<gradium-voice-id-returned-from-clone>",
  "vendor": "gradium",
  "created_at": 1783070052,
  "sample_duration_ms": 4820,
  "sample_url": "/photo-uploads/GRADIUMDEMO/voices/2026-07-03-101412.wav"
}
```

## Backend routes — where each lives

All three land in `agent-samples/simple-backend/local_server.py`. Kept
vendor-agnostic so ElevenLabs / Cartesia clone support drops in the same
shape later.

### `POST /clone-voice?profile=<P>&vendor=gradium`

- Multipart `audio` field. Server generates the datetime slug.
- Forwards audio to Gradium (details from the blocker section above).
- Writes `<slug>.wav` (raw recording) + `<slug>.json` (metadata).
- Returns the sidecar JSON.

Skeleton:

```python
@app.route('/clone-voice', methods=['POST'])
def clone_voice():
    profile = _safe_profile(request.args.get("profile"))
    vendor = request.args.get("vendor", "gradium")
    audio = request.files.get("audio")
    if not audio:
        return jsonify({"error": "missing 'audio' file"}), 400
    constants = initialize_constants(profile)
    tts_key = constants.get("TTS_KEY")
    if not tts_key:
        return jsonify({"error": f"no TTS_KEY for profile {profile}"}), 400

    slug = datetime.utcnow().strftime("%Y-%m-%d-%H%M%S")
    voices_dir = os.path.join(_photo_dir(profile), "voices")
    os.makedirs(voices_dir, exist_ok=True)
    wav_path = os.path.join(voices_dir, f"{slug}.wav")
    audio.save(wav_path)

    if vendor == "gradium":
        voice_id = _gradium_clone(wav_path, tts_key)   # ← blocker
    else:
        return jsonify({"error": f"unsupported vendor {vendor}"}), 400

    sidecar = {
        "id": slug,
        "voice_id": voice_id,
        "vendor": vendor,
        "created_at": int(datetime.utcnow().timestamp()),
        "sample_duration_ms": _wav_duration_ms(wav_path),
        "sample_url": f"/photo-uploads/{profile}/voices/{slug}.wav",
    }
    with open(os.path.join(voices_dir, f"{slug}.json"), "w") as f:
        json.dump(sidecar, f)
    return jsonify(sidecar)
```

### `GET /voices?profile=<P>&limit=12`

- Newest-first list. Same shape as `/photos`.
- **No default seed** — the list can be empty. The stock male/female
  fallback is handled by `pickGradiumVoice(meta.sex)` on the frontend
  when the user hits Skip.

### `GET /voice/<slug>?profile=<P>`

Returns one sidecar. Symmetric with `/photo/<id>`.

## Frontend — `convoai-demo.agora.io/react-photo-avatar`

### `lib/photo.ts`

Add helpers:

```ts
export type VoiceMeta = {
  id: string
  voice_id: string
  vendor: string
  created_at: number
  sample_duration_ms: number
  sample_url: string
}

export async function listVoices(profile: string, limit = 12): Promise<VoiceMeta[]>
export async function submitCloneVoice(profile: string, blob: Blob): Promise<VoiceMeta>
```

Keep `avatarTalkUrl` signature stable — the resolved voice_id is
threaded through as a query param on the Talk URL, exactly as
`pickGradiumVoice` already does today.

### `components/VoicePickerStep.tsx` (new)

Mounted after photo upload only when `searchParams.audiopick === "GRADIUM"`.

Layout:

```
┌───────────────────────────────────────────────────┐
│  🎤  Pick a voice for your avatar                │
│                                                    │
│  [ + Record new voice ]                            │
│                                                    │
│  Previous clones                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐     │
│  │ Jul 03     │ │ Jul 03     │ │ Jul 02     │ ⋯  │
│  │ 10:14:12   │ │ 09:42:03   │ │ 16:45:11   │     │
│  │ ▶ 5s       │ │ ▶ 4s       │ │ ▶ 3s       │     │
│  │ [Use]      │ │ [Use]      │ │ [Use]      │     │
│  └────────────┘ └────────────┘ └────────────┘     │
│                                                    │
│  [ Skip — use default male / female ]             │
└───────────────────────────────────────────────────┘
```

Interactions:

- **Record new** → modal with the *current* datetime shown as the
  label. MediaRecorder Record/Stop. Preview via `<audio>`. Submit →
  `submitCloneVoice(profile, blob)` → returns `voice_id` → advance to
  Talk with that voice_id.
- **Use [datetime]** → uses that card's `voice_id` → advance to Talk.
- **Skip** → advance to Talk with `pickGradiumVoice(meta.sex)` (the
  existing stock fallback).

### `app/upload/page.tsx`

After the photo step, if `searchParams.audiopick === "GRADIUM"`, mount
`<VoicePickerStep onResolved={(voice_id) => goToTalk(voice_id)} />`.

### Talk URL

```
/photo-call?profile=GRADIUMDEMO&voice_id=<resolved>&avatar_id=<photo>&prompt=<...>
```

`voice_id` comes from whichever branch of the picker fired. Zero
photo-sidecar mutation — same photo can be spoken by different voice
clones for different sessions.

## Backwards compat

| Change | Impact on existing surface |
|---|---|
| `?audiopick=GRADIUM` query param | Optional; absent = today's behaviour verbatim. |
| `POST /clone-voice` | New URL; existing profiles never call it. |
| `GET /voices`, `/voice/<slug>` | New URLs; `voices/` subdir only exists for profiles that use the picker. |
| `VoicePickerStep` component | Mounted only under the query flag. |
| `voices/` subdir under `/uploads/<profile>/` | Never populated for `PHOTO_GEMINI`, `EVENTDEMO`, `LES`, `EVENTTRU`, `EVENTANAM`, `EVENTANAMGRADIUM`. |

Zero regression risk on the other photo demos.

## Sequencing / rollout order

1. **Backend list + get routes** (`/voices`, `/voice/<slug>`) — trivial to
   write; unblocks frontend gallery even before the clone API is wired.
2. **Frontend `VoicePickerStep` component + hooks in the upload flow** —
   list works immediately; record UI in place but submit disabled or
   returns "clone not configured yet".
3. **`POST /clone-voice`** with the actual Gradium clone HTTP call —
   final piece, unblocked by the doc question above.

Option to ship 1+2 first as a stub so the UX flow is verifiable; add 3
once Gradium's clone endpoint is confirmed.

## Open questions to revisit

- Do we want per-clone metadata like *who* cloned it? Currently just the
  timestamp — the picker gallery is anonymous. Fine for demo booths;
  might not be for prod.
- Should we cap `voices/` at N (e.g. 100) and prune the oldest, or let
  it grow forever?
- Any Gradium clone-cost concern that would make us want a rate-limit
  on `POST /clone-voice`?
- Preview playback: hidden `<audio>` per card? Or a shared player?
- Do we want a name-override field in the record modal, or is the raw
  datetime enough as a label?
- Should the default GRADIUMDEMO fallback tile in the photos grid also
  get "voice packs" seeded so first-time visitors see 1–2 sample clones
  in the gallery even before anyone has recorded? (Probably not — the
  Skip path already covers that case with stock voices.)

## What lands where at commit time

| Change | Repo | File(s) |
|---|---|---|
| Backend routes | `AgoraIO-Conversational-AI/agent-samples` | `simple-backend/local_server.py` + a small `simple-backend/photo/voices_gradium.py` if the clone HTTP call needs its own module |
| Frontend picker step + hooks | `BenWeekes/convoai-demo.agora.io` | `react-photo-avatar/lib/photo.ts`, new `react-photo-avatar/components/VoicePickerStep.tsx`, `react-photo-avatar/app/upload/page.tsx` |
| Deploy doc row | `BenWeekes/convoai-demo.agora.io` | `conf/deploy.md` |
| `.env` block updates | not committed (gitignored) | `simple-backend/.env` — no new keys needed unless Gradium clone uses a separate key |
