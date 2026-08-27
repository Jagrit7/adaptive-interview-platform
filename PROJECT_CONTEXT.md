# Adaptive Interview Platform — Project Context

This document is written to give any LLM (or human) full context on this project in one read. It covers the problem, the decisions made and why, the current architecture, the exact repo layout, what's built vs not, and the hard-won debugging lessons from getting this working. Treat this as the single source of truth for picking the project back up.

---

## 1. What this is

A hackathon project (problem statement ps11): build an **adaptive voice interview platform** where multiple AI interviewers (technical, hiring manager, product/customer, behavioural, etc.) conduct a live voice interview with a candidate. Must use **Agora** for the real-time voice pipeline.

Required capabilities per the problem statement:
- Real-time, interruptible voice interviews
- Multiple interviewer roles/personalities
- Shared candidate context between interviewer roles
- Dynamic follow-up questions (not a fixed script)
- Controlled interviewer turn-taking
- Role-play / scenario-based questions
- Difficulty adjustment based on candidate performance
- Detection of vague or contradictory answers
- Evidence-based feedback linked to the transcript
- A structured final assessment
- Clear disclosure that the candidate is talking to AI

**Timeline: one full week** (this is a separate, longer hackathon from an earlier 8-hour Agora hackathon the same person was also prepping for — don't confuse the two if you see other Agora-related context).

**Team/builder note:** frontend implementation work has been handed off to a builder referred to as "Antigravity" via a written frontend brief (see `frontend/interview-platform-frontend-brief.md`). Backend and integration work has been done directly in this conversation.

---

## 2. Key product decision: platform, not a single fixed panel

Two options were considered: (a) build one fixed-use-case panel (e.g., just an SDE interview), or (b) build a **configurable platform** where panels can be built/tuned, then use that platform to configure and run the actual demo panel live.

**Decision: build the platform.** The demo *is* proof the platform works — configure a real panel through the actual UI, then run it live, rather than faking a "platform" story around one hardcoded flow.

### The 5 planned recipe presets
Recipes are just pre-filled instances of the same agent config schema — not special-cased code. Only **SDE panel is actually built** so far; the other four are planned but not implemented.

1. **SDE / tech engineering** (BUILT) — technical (DSA), technical (system design), technical (AI/ML domain), HR (behavioural & communication). This is the primary, fully-working demo panel and matches the problem statement's own example scenario.
2. **UPSC Civil Services personality test** (not built) — chairman + members covering current affairs, optional subject, ethics/admin judgment, psychologist-style temperament read. No "technical correctness" axis — pure judgment/composure/coherence.
3. **MBA/B-school PI round** (not built) — academic/alumni interviewer, "why MBA" interviewer, stress interviewer (deliberately interrupts/contradicts).
4. **Bank PO / PSU government job** (not built) — HR, domain expert (banking/finance), general awareness.
5. **Sales/BD role** (not built) — hiring manager, role-playing "customer" (runs an actual mock pitch, doesn't ask questions), leadership/culture interviewer.

Plan: ship these 5 as ready-to-use recipes users can fine-tune, plus support building a fully custom panel from scratch — same underlying config schema and builder UI for all three paths (recipe / fine-tune / from-scratch).

For the live demo itself: fully run the SDE panel live end-to-end (proven working, see §6), and show a second panel's *config screen* (UPSC or Sales) to demonstrate breadth without doubling live-demo risk.

---

## 3. Architecture

### 3.1 High-level panel flow (finalized, refined from an earlier whiteboard sketch)

The original sketch was a **fixed sequential loop** (agent1 → agent2 → agent3 → scorer scores all three → loop back to agent1 if unsatisfied). This was rejected: it doesn't match "adaptive" (fixed order regardless of answer content), and scoring only at the end means no shared context *during* the interview.

**Current flow (per-answer, not per-panel):**
```
Current agent asks a question
        ↓
Candidate answers
        ↓
Scorer evaluates THIS answer only (score + vague/contradiction flags)
        ↓
Shared state updates (per-agent scores, transcript, flags) — written after EVERY answer
        ↓
Orchestrator decides next step, using shared state:
  - same agent asks a follow-up, OR
  - hand off to a different agent, OR
  - done (once all competencies for all agents are covered)
        ↓
(loop back to "current agent asks" until done)
        ↓
Store final structured result in DB
```

This is what makes it "adaptive" and gives real shared context — every agent can see what every other agent already learned, updated turn by turn, not just at the end.

### 3.2 Agent execution model: single Agora agent instance, persona hot-swapped

Agora's Conversational AI Engine **does support multiple simultaneous live agent instances in one channel** (confirmed against docs) — so "3 real separate agent processes in one channel" is technically possible. But Agora's own docs flag that multiple agents subscribed to all UIDs detect each other and affects idle-timeout behavior, and turn-taking between simultaneously-live agents has to be built entirely by hand (mute/unmute gating).

**Decision: default to ONE Agora agent instance per session, with the orchestrator hot-swapping its persona** (system prompt + TTS voice) whenever the "active interviewer" changes, rather than running N simultaneous agent instances. This avoids multi-agent audio/turn-taking conflicts entirely while still giving the candidate a clearly different voice and question style per interviewer.

True multi-agent-in-channel is a legitimate stretch goal if time allows, since the config schema is role-agnostic and doesn't care which execution model is used — but it's not the default and hasn't been built.

### 3.3 Config → Agora translation

Every field in an agent's config JSON goes to exactly one of three places:

**A. Real Agora Join API fields (used almost as-is):**
- `voice.vendor` / `voice.voice_id` / `voice.language` → `tts` / `asr` config
- `behavior.greeting_message` → `llm.greeting_message`
- `behavior.failure_message` → `llm.failure_message`
- `skills.interrupt_sensitivity` → VAD/turn_detection params

**B. Composed as text INTO the system prompt (no direct Agora field):**
- `behavior.system_prompt` (base text)
- `interview_logic.difficulty_min/max`, `follow_up_aggressiveness`
- `skills.loop_until_satisfied`, `skills.contradiction_probing`, `skills.role_play_mode`
- These get concatenated into one final string → `llm.system_messages`. See `build_system_prompt()` in `backend/app/orchestrator/agent_launcher.py`.

**C. Pure backend/orchestrator logic — never sent to Agora at all:**
- `id`, `name`, `role`, `accent_color`, `avatar`
- `interview_logic.seed_questions_ref`, `max_turns_before_handoff`
- `turn_taking.*` (all of it)
- `scoring_input.competencies`
- the entire top-level `scorer` block in a recipe's `config.json`

All of these fields ARE editable from the frontend builder UI regardless of which of the three destinations they map to — the split above is purely a backend/translation concern, invisible to the person configuring a panel.

### 3.4 Why no knowledge base / RAG for question generation

DSA, system design, and general ML fundamentals are well-trodden domains an LLM already knows — a vector DB over interview questions was considered and rejected as unnecessary engineering risk for a hackathon timeline. The actual risk is **scoring consistency**, not question generation, so grounding effort went into hand-written `rubrics.json` (grading criteria per competency) and `seed_questions.json` (a small vetted question pool per topic) rather than retrieval infrastructure. For DSA specifically, the technical agent also gets a `code_execution` tool so it can verify complexity/correctness claims directly rather than the scorer guessing.

**Caveat, stated explicitly and worth repeating to anyone using this:** the seed questions and rubrics are a small hand-written starting set good enough to prove the panel works and demo credibly — not independently validated against a real hiring rubric. Fine for a hackathon; would need real review before being treated as a real product.

---

## 4. Tech stack

- **Backend:** Python, FastAPI. (Deliberately NOT Node/TypeScript, despite the frontend being Next.js — decided partway through, backend rebuilt in Python.)
- **Frontend:** Next.js (App Router), TypeScript. Scaffolded as its own top-level folder (`frontend/`), separate from `backend/` — not a combined single Next.js app with API routes.
- **Voice/agent execution:** Agora Conversational AI Engine, via the official `agora-agents` Python package (import name `agora_agent`) — NOT raw REST calls by hand, the package wraps the Join/Update/Stop/Query REST endpoints in a builder pattern (`Agent(client).with_stt(...).with_llm(...).with_tts(...)`, `agent.create_session(...).start()`).
- **Token generation:** see §6.4 — this took several iterations to get right. Final answer: a locally-patched clone of `AgoraIO/Tools`' Python `AccessToken2`/`RtcTokenBuilder2`, NOT the `agora-token-builder` PyPI package (which only builds RTC-only or RTM-only tokens separately, insufficient for this frontend's hook design).
- **Frontend Agora client:** `agora-rtc-sdk-ng`, `agora-rtm`, `agora-agent-client-toolkit` — copied from Agora's own `agent-samples/react-voice-client` reference implementation (hook: `useAgoraVoiceClient.ts`), not written from scratch.

---

## 5. Repo structure (actual, as of last check)

```
adaptive-interview-platform/
│
├── backend/
│   ├── .env                              # Agora credentials — real secrets, not committed
│   ├── app/
│   │   ├── main.py                       # FastAPI app: /agents/start, /token routes, CORS
│   │   ├── token_generator.py            # generates combined RTC+RTM token (see §6.4)
│   │   └── orchestrator/
│   │       └── agent_launcher.py         # config.json -> system prompt -> Agora Join call
│   │
│   ├── recipes/
│   │   └── sde_panel/                    # ONLY recipe built so far
│   │       ├── config.json               # 4 agents + scorer block
│   │       ├── seed_questions.json       # per-topic question pool (dsa/system_design/aiml/behavioural)
│   │       └── rubrics.json              # weak/adequate/strong grading criteria per competency
│   │
│   ├── agora-token-tools/                # git-cloned from AgoraIO/Tools, relative imports
│   │                                      # manually patched to absolute (see §6.4 gotcha)
│   │   └── DynamicKey/AgoraDynamicKey/python/src/
│   │       ├── AccessToken2.py
│   │       ├── RtcTokenBuilder2.py       # has build_token_with_rtm() — the function actually used
│   │       └── ...
│   │
│   └── agent-samples/                    # cloned from AgoraIO-Conversational-AI/agent-samples
│       ├── simple-voice-client-no-backend/   # standalone HTML test client (App ID/channel/token/UID form)
│       ├── simple-voice-client-with-backend/
│       └── react-voice-client/
│           └── hooks/useAgoraVoiceClient.ts  # SOURCE of the hook copied into frontend/hooks/
│
├── frontend/
│   ├── interview-platform-frontend-brief.md  # the written spec handed to the frontend builder
│   ├── app/
│   │   ├── page.tsx                      # HOME page (rebuilt once after an accidental overwrite — see §7)
│   │   ├── builder/                      # agent config builder UI
│   │   │   ├── page.tsx
│   │   │   ├── AgentConfigForm.tsx
│   │   │   ├── LeftRail.tsx
│   │   │   └── ScorerConfigForm.tsx
│   │   └── test-voice/                   # manual integration-test page (not part of the real product UI)
│   │       ├── page.tsx                  # thin wrapper, next/dynamic ssr:false (see §7 gotcha)
│   │       └── VoiceTestClient.tsx        # actual test UI + calls to backend
│   │
│   ├── components/ui/                    # design system: Button, Card, EditableText, Waveform,
│   │                                      # FormElements, RoleAccentProvider
│   ├── hooks/
│   │   └── useAgoraVoiceClient.ts        # copied from agent-samples/react-voice-client
│   └── store/
│       └── builderStore.ts               # builder UI state
│
└── .idea/                                # JetBrains project files (WebStorm/PyCharm) — has Local History,
                                           # useful for recovering accidentally-overwritten files
```

**Not yet built:** `frontend/app/recipes/` (recipe picker page — currently 404s), UPSC/MBA/Bank-PO/Sales recipe folders, any real "start interview from the builder" wiring (currently only the standalone `test-voice` page proves the pipeline works, hardcoded to the `tech-dsa` agent).

---

## 6. Design system (frontend)

Dark, near-black theme like Agora's own console, but **multi-color per-role accent system** instead of one brand blue — color is functional (tracks which interviewer is which across builder/transcript/report), not decorative. Signature visual element: a thin animated waveform motif (ambient/slow on the home hero, meant to become a "listening" indicator in the live-session screen later) — used sparingly, not on every element.

Full detail (palette hex values, type scale, component-by-component page specs) lives in `frontend/interview-platform-frontend-brief.md` — read that file directly for anything UI-specific rather than re-deriving it.

---

## 7. Current progress / milestones reached

In order, all confirmed working:

1. ✅ Single hardcoded agent joined a channel via `/agents/start`, greeting played, confirmed `RUNNING` via the query endpoint. (First proof Agora integration works at all.)
2. ✅ Full config-driven flow: `recipes/sde_panel/config.json` → `agent_launcher.py` builds the system prompt and calls Join → agent joins → **standalone test client** (`simple-voice-client-no-backend`) hears the greeting and holds a live conversation.
3. ✅ Frontend wired up: CORS added to FastAPI, `/token` route added, `useAgoraVoiceClient.ts` hook copied from `agent-samples/react-voice-client`, a manual test page built at `frontend/app/test-voice/`.
4. ✅ **Full frontend-to-Agora loop confirmed working end to end** — clicking "Start Interview" on the actual Next.js test page calls the backend, generates a token, starts the agent, joins via the real Agora Web SDK hook, and the `tech-dsa` agent spoke and held a live two-way conversation. This is the most important milestone so far — proves the entire pipeline the real product will use.

**Not yet done:** wiring the real builder UI (not the raw test page) to actually launch a configured panel; building the other 4 recipes; any orchestrator logic for multi-agent handoff within a live session (current test only exercises a single agent, not the full 4-agent SDE panel flow); the scorer's actual runtime implementation (rubrics/config exist, but no code reads them yet during a live session); the final structured assessment generation; the AI-disclosure UI; a `/recipes` picker page.

---

## 8. Hard-won debugging lessons (read this before repeating any of these)

These cost real time to find — check these first if something breaks again in a similar way:

1. **Windows PowerShell ≠ cmd.** `rmdir /s /q` is a cmd command; PowerShell needs `Remove-Item -Recurse -Force`.

2. **Relative paths in Python scripts must be anchored to `__file__`, not assumed cwd.** `agent_launcher.py`'s `RECIPE_PATH` and `token_generator.py`'s `sys.path.append` both broke because they were written as plain relative paths, which only resolve correctly if the script happens to be run from one specific directory. Fix pattern: `Path(__file__).resolve().parent...` / `os.path.join(os.path.dirname(__file__), ...)`.

3. **`uvicorn app.main:app --reload` must be run from `backend/`, not `backend/app/`.** And `main.py`'s imports must be absolute relative to `app` as the top-level package (`from app.orchestrator.agent_launcher import ...`), NOT `from backend.app.orchestrator...` — that only works if you're somehow running from one level above `backend/`, which you're not.

4. **Channel name must match EXACTLY, character for character, across three places:** the token generator's `channel_name`, the `/agents/start` call's `channel` param, and the browser client's channel field. A mismatch here produces `CAN_NOT_GET_GATEWAY_SERVER: invalid token, authorized failed` — which looks like a credentials problem but usually isn't.

5. **Agora Console vs RESTful API credentials are different pairs, easy to mix up:** App ID + App Certificate (project page, pencil icon → Project Security) is for RTC tokens. Customer ID + Customer Secret (account menu → RESTful API) is for Basic Auth on the Conversational AI REST endpoints (Join/Query/Leave). Neither substitutes for the other.

6. **`agora-token-builder` (PyPI) only builds separate RTC-only or RTM-only tokens (legacy Token1-style).** The `useAgoraVoiceClient.ts` hook uses ONE `config.token` value for BOTH `rtmClient.login({ token: config.token })` AND `rtcClient.join(..., config.token, ...)` — meaning it needs a single combined token with both RTC and RTM privileges baked in (Agora's "Token2" / `AccessToken2` format), not two separate token strings. The fix was cloning `AgoraIO/Tools` (`git clone --depth 1 https://github.com/AgoraIO/Tools.git`) and using `RtcTokenBuilder.build_token_with_rtm(...)` from its Python `RtcTokenBuilder2.py`.

7. **That cloned repo's Python files use relative imports (`from .AccessToken2 import *`) designed for proper package installation, which fail with "attempted relative import with no known parent package" when imported via a plain `sys.path.append`.** Fix: manually edit each such import to drop the leading dot (`from AccessToken2 import *`). This cascades through multiple files (`RtcTokenBuilder2.py` → `AccessToken2.py` → `Packer.py`, etc.) — use `findstr /s /m "from \." *.py` in that folder to find all of them in one pass rather than fixing them one at a time as errors surface.

8. **`agora-rtc-sdk-ng` touches `window` at import time, which breaks Next.js's server-side module evaluation even inside a `"use client"` component.** Fix: split the component using the hook into its own file, and wrap it with `next/dynamic(() => import("./X"), { ssr: false })` in `page.tsx`, so it's never evaluated server-side at all.

9. **A `Waveform` component using `Math.random()` inside `useState()`'s initializer causes a React hydration mismatch**, since server and client each compute different random values during the initial render. Fix: initialize with a fixed value, randomize only inside `useEffect` (after mount, client-only).

10. **A global CSS reset (`button { background: transparent; border: none; }`) makes buttons invisible but still fully functional** — don't mistake "looks unstyled" for "broken." Check click behavior / Status-line changes before assuming a missing button is a rendering bug.

11. **`create_file` (Claude's own tool) writes to Claude's sandbox, not the user's actual machine — even when given a real Windows path as the target.** Every file meant for the actual project had to be downloaded and manually placed by the user. Once, a generated file was dropped into the wrong location (`frontend/app/page.tsx` directly instead of a new `test-voice/` subfolder), overwriting the real home page with no git history to recover it — it had to be rebuilt from scratch using the existing design-system components. **Lesson: always double-check the exact target path before saving/replacing any file in this repo, and commit to git regularly so this class of mistake is recoverable next time.**

12. **`.idea/` folder confirms this project uses a JetBrains IDE, which keeps Local History independently of git** — worth checking (right-click file → Local History → Show History) before assuming an overwritten file is unrecoverable.

---

## 9. Open decisions / things to revisit

- `scorer.satisfaction_threshold` in `sde_panel/config.json` is currently set to `3` (meaning a competency only counts as "covered" at the `strong` grade level on a weak/adequate/strong 1-3 scale) — this will likely make interviews run long. Consider `2` (adequate-or-above) instead. Not yet decided.
- Whether to eventually support true multi-agent-in-channel (Agora supports it) as an advanced/stretch mode, vs staying with single-agent persona-swap permanently.
- Whether `rubrics.json` should become frontend-editable (currently hand-written, not exposed in the builder UI at all).
- The `.env` file with real Agora credentials exists in `backend/` — fine for local hackathon dev, but flag before any code/repo is ever shared or made public.
