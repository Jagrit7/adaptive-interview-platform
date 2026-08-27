# 05 Workflows

> Step-by-step guides for common changes in the sample stack.

## Add a New Backend Profile

1. add prefixed env vars in `simple-backend/.env`
2. verify profile-specific defaults in backend config resolution
3. run backend and client with `?profile=<name>`

## Point a Profile at a Custom LLM

1. set `<PROFILE>_LLM_URL`
2. set `<PROFILE>_LLM_VENDOR=custom`
3. set `<PROFILE>_LLM_STYLE=openai`
4. verify latest `/tmp/agora_curl_*.sh` shows the public custom-LLM URL

## Run Human Meeting Mode

1. ensure dashboard integration env vars are set
2. use `/join-meeting` flow from the client
3. verify meeting authorization and service-registration paths

## Run the Photo-Avatar Demo

1. add a photo profile to `.env` (LLM + TTS + AVATAR_VENDOR=generic + AVATAR_API_BASE_URL).
2. set `<PROFILE>_AVATAR_ID=https://your.host/photo-uploads/<PROFILE>/latest.jpg` so the LemonSlice generic renderer points at the gallery's "latest" symlink.
3. set `PHOTO_VISION_API_KEY` (OpenAI key for `gpt-4o-mini` vision).
4. point your client at `/photo?profile=<PROFILE>` to land in the gallery; uploads via `/upload-photo?profile=<PROFILE>` write to `/uploads/<PROFILE>/<id>.jpg` + a sidecar JSON.
5. Optional: add the profile to the gallery's `CASCADING_PROFILES` allowlist in `react-photo-avatar/lib/photo.ts` if you want per-photo voice IDs from vision/sex detection to reach the call.

## Run the `/news` Shared-Channel Viewer

1. add a `NEWS` (or any) profile in `.env` — viewers never publish a mic track, but ConvoAI still needs a valid LLM + TTS + avatar block to start. The default prompt should explicitly tell the LLM to stay silent.
2. host the static viewer at `<host>/news/` (e.g. `web/news/index.html` from the personal repo); it auto-joins, heartbeats every 15 s, and `sendBeacon`s `/news/leave` on unload.
3. open `https://<host>/news?channel=<name>&profile=<P>`. First viewer starts the agent + reader; subsequent viewers reuse.
4. `GET /news/status` for an operator dump of running channels + last spoken text. `pm2 logs simple-backend | grep '\[news\]'` for per-turn `/speak` traces.

## Related Deep Dives

- [therapy_profile](L2/therapy_profile.md) — full therapy / biomarker / dashboard-backed workflow
