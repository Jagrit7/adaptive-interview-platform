# Running in Docker

```bash
cp .env.example .env      # fill it in
docker compose up --build
```

Frontend on http://localhost:3000, backend on http://localhost:8000,
API docs on http://localhost:8000/docs.

## What is and isn't containerised

Two services: `backend` (FastAPI) and `frontend` (Next.js).

**Supabase is not a service here.** It is hosted, the browser talks to it
directly, and the backend never touches it. Adding a Postgres container would
give you a second, different database with none of your RLS policies on it.

## The one thing that catches people

**`NEXT_PUBLIC_*` variables are baked into the JavaScript bundle at build time.**
They are `build.args` in `docker-compose.yml`, not `environment`. Putting them
under `environment` leaves them undefined in the browser, and the app fails with
"Supabase is not configured" while `docker compose exec frontend env` clearly
shows them set.

Changing any of them needs a rebuild, not a restart:

```bash
docker compose build frontend && docker compose up -d frontend
```

Backend variables are ordinary runtime environment and only need a restart.

## requirements.txt

Derived by scanning actual imports across `backend/app` and `backend/tests`, then
resolved in a clean virtualenv and confirmed sufficient — `import app.main`
succeeds with exactly that set and nothing else.

Two entries are there despite never being imported by name, which is how they get
missed:

- **`uvicorn[standard]`** — the server itself.
- **`python-multipart`** — FastAPI needs it for `UploadFile` in
  `routes/knowledge.py`. Without it, `POST /knowledge/parse` fails at import with
  *"Form data requires python-multipart to be installed"*.

**`RtcTokenBuilder2` is deliberately absent.** It is not a PyPI package.
`token_generator.py` appends
`agora-token-tools/DynamicKey/AgoraDynamicKey/python/src` to `sys.path` and
imports it from there, so the Dockerfile `COPY`s that directory. Miss it and the
container starts fine, then 500s the first time anyone requests a token.

`requirements-dev.txt` adds `httpx`, which `TestClient` needs. It is not in the
production image.

## Image notes

**Backend** — `python:3.12-slim`, non-root (uid 10001), requirements copied
before app code so editing code doesn't rebuild the dependency layer. The
`HEALTHCHECK` uses `python -c urllib.request` rather than curl, because the slim
image has neither curl nor wget.

`/health` deliberately does no work — it must not call Agora or Groq. A health
check that depends on a third party reports *their* outage as this service being
down, and the orchestrator responds by restart-looping a process that is fine.

**Frontend** — multi-stage on `node:22-alpine`, using Next's `output: "standalone"`
(added to `next.config.ts`, harmless in dev) so the runtime image carries only the
`node_modules` actually reached. Non-root.

**CORS** now reads `CORS_ALLOW_ORIGINS` instead of a hardcoded
`http://localhost:3000`, which would break the moment this runs anywhere else —
as a browser CORS error with nothing in the server log.

## Running the tests

```bash
docker compose run --rm --entrypoint sh backend -c "pip install -r requirements-dev.txt && python -m tests.test_e2e"
```

Or locally, which is faster:

```bash
cd backend && pip install -r requirements-dev.txt
python -m tests.test_knowledge_and_voice
python -m tests.test_orchestrator
python -m tests.test_e2e
```

`tests/` is excluded from the image by `.dockerignore`, so the first form
installs them into a throwaway container.

## What was and wasn't verified

Docker was not available where this was built, so **the images have never been
built**. Saying that plainly matters more than the checks below.

Verified:

- `requirements.txt` installs into a clean virtualenv, and `import app.main`
  succeeds with exactly that set and nothing else.
- Every `COPY` source in both Dockerfiles exists in its build context.
- `docker-compose.yml` parses, and every `${VAR}` it references is present in
  `.env.example` — with nothing unused in either direction.
- `next build` completes with **0 type errors** and prerenders all 9 routes,
  including the new `/login` and `/panels`.
- `output: "standalone"` produces `.next/standalone/server.js`, its
  `node_modules`, and `.next/static` — the four things the frontend Dockerfile
  copies. 49 MB standalone against 553 MB of `node_modules`.
- `/health` returns 200, and `CORS_ALLOW_ORIGINS` parses a comma-separated list.

Not verified: layer caching, image size, whether the containers actually start
and reach each other. Run `docker compose up --build` once before relying on it.

### The build blocker this turned up

`next build` runs type checking, and the frontend had two pre-existing type
errors in `hooks/useAgoraVoiceClient.ts`. They were harmless in `next dev`, which
skips the type pass — but they made **`next build` fail, so the frontend image
could not be built at all.** Both came from the code being written against a
different version of `agora-agent-client-toolkit` than the one installed (2.9.1):

- `rtmConfig: { rtmEngine }` — the config takes `rtmEngine` at the top level.
  There is no `rtmConfig` wrapper, so the RTM client was being silently dropped,
  and RTM is what carries the transcript stream.
- `TranscriptHelperItem` is generic and needs its type argument.

Fixing the second surfaced a third problem that was never a type error at all:
the code read `m.timestamp`, but the toolkit field is `m._time`. So `timestamp`
was `undefined` on every message and the sort

```ts
.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
```

was evaluating `0 - 0` on every comparison. **Transcript ordering has never
worked** — it has only ever looked like it did, because messages usually arrive
in order anyway. That one is worth watching for in the next live run.

## Not production-ready

Two things to fix before this faces real users, both flagged in the code:

- **`SESSIONS` is an in-process dict.** Sessions do not survive a restart, and
  scaling past one worker means a session started on one is invisible to the
  other. `--workers 2` would break interviews. Move to Redis first.
- **No reverse proxy or TLS.** Agora's WebRTC needs HTTPS from anything that
  isn't localhost.
