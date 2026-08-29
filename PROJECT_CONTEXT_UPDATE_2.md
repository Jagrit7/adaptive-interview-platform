# Adaptive Interview Platform — Project Context (Update 2)

Supersedes PROJECT_CONTEXT_UPDATED.md for anything listed here. Read that doc first for everything unchanged; this covers what happened since.

---

## 1. The full custom-panel-to-live-interview path is now built and mostly working

This was the actual goal of this stretch: build an agent in the real builder UI, click one button, and talk to that exact configured panel live. That loop is now wired end-to-end, using the REAL "Start Panel" button and `/interview-room` page that already existed in the frontend (an earlier redundant `/builder/interview-live` page was built by mistake and should be deleted - the real integration point was always `app/interview-room/`).

**New/changed files, this stretch:**
- `backend/app/schemas/panel.py`, `backend/app/orchestrator/state.py`, `backend/app/orchestrator/scorer.py`, `backend/app/orchestrator/orchestrator.py` - all from the previous update, now actually wired together.
- `backend/app/routes/sessions.py` (NEW) - `POST /sessions/start` and `POST /sessions/{id}/next`, ties `build_initial_queue` → `start_session_agent` → in-memory `SESSIONS` dict → `score_turn` → `apply_score_result` → `decide_next_step` → `swap_agent_persona`/`inject_followup` into one real flow.
- `backend/app/main.py` - now includes the sessions router.
- `backend/app/orchestrator/agent_launcher.py` - `swap_agent_persona()` and a NEW `inject_followup()` function, both using CONFIRMED real SDK methods (`session.update()`, `session.think()` - verified against Agora's official Python SDK reference docs, not guessed). Voice agent LLM switched from OpenAI to Groq (`openai/gpt-oss-20b`).
- `backend/app/orchestrator/orchestrator.py` - `apply_score_result()` fixed to take PER-COMPETENCY thresholds from `panel.scorer.competencies` instead of one global scalar (a real bug caught while wiring the session endpoints).
- `frontend/store/builderStore.ts` - added `activeSpeakerId`/`setActiveSpeakerId` (the existing `interview-room/page.tsx` already read `activeSpeakerId` but the store never actually had it - always `undefined`) and `logic.maxVisits` on the Agent type (backend already expected it, frontend didn't have it).
- `frontend/app/interview-room/page.tsx` - converted to a thin `next/dynamic({ssr:false})` wrapper (same requirement as every Agora-SDK-touching page - `agora-rtc-sdk-ng` accesses `window` at import time).
- `frontend/app/interview-room/InterviewRoomLive.tsx` (NEW) - the real logic: starts a session against whatever's currently in `builderStore`, joins Agora, watches `messageList` for finalized candidate turns, forwards each to `/sessions/{id}/next`, drives the real `InterviewRoomWindow` visual component's `activeSpeakerId` from actual orchestrator decisions instead of it being permanently blank.
- `frontend/app/builder/AgentConfigForm.tsx` - "Max visits" field added to the Interview Logic tab (step 4).
- `frontend/components/ui/FormElements.tsx` - **`Switch` component was completely non-functional** (see bugs below).

### Transcript-delivery design - LOCKED (Option A chosen)

The frontend calls `POST /sessions/{id}/next` itself, after each candidate turn finalizes in the Agora transcript stream (`useAgoraVoiceClient.ts`'s `messageList`, which is already filtered to only completed/final turns internally - no `final` field exists, contrary to an earlier guess). The backend never listens to RTM independently. Tradeoff accepted: if the browser tab dies mid-turn, that turn is lost - acceptable for a hackathon, would need Option B (backend-side RTM listener) for a real product.

### Confirmed real Agora SDK methods (previously unverified/guessed)

Checked against Agora's official Python SDK reference docs:
- `session.update(...)` - real, "Updates the agent configuration mid-session without restarting. Accepts a partial properties object in REST API format." Used for `swap_agent_persona()`. The exact nested field shape (`llm={...}, tts={...}`) is still a best-guess match to the Join endpoint's shape, not independently confirmed field-by-field.
- `session.think(text)` - real, "Injects a custom text instruction into the running agent." Used for the NEW `inject_followup()` function - this closes a previously-missing piece (the FOLLOW_UP orchestrator action had no mechanism before this).
- `session.speak(...)` and `session.interrupt(...)` also exist, not yet used anywhere.

---

## 2. LLM provider: Groq, confirmed and wired (not just decided)

- Voice agent (`agent_launcher.py`'s `start_session_agent`): `Groq(model="openai/gpt-oss-20b", ...)`, confirmed the `agora_agent` package has a first-class `Groq` class matching the same builder pattern as `OpenAI`.
- Scorer (`scorer.py`'s `score_turn`): real call via the `groq` Python package (`AsyncGroq`), `model="openai/gpt-oss-120b"`, `response_format={"type": "json_object"}`. This REPLACED the earlier `NotImplementedError` stub - it's a working implementation now, not a placeholder.
- Both confirmed as real, current, production-tier Groq models.
- Requires `pip install groq` and `GROQ_API_KEY` in `backend/.env`.

---

## 3. Real bugs found and fixed while testing (not design decisions - actual defects)

1. **`Switch` component in `FormElements.tsx` had NO click handler at all.** Every toggle in the builder (Can open the interview, Role-play mode, Loop until satisfied, Contradiction probing) was purely decorative - clicking never fired `onChange`. This affected every agent ever configured before the fix; any agent's skills/turn-taking toggles that "looked" set may never have actually applied. Fixed by adding `onClick={() => onChange(!checked)}` to the switch's div.

2. **Role-tile casing mismatch in `AgentConfigForm.tsx`.** The role-selection tile array had `"Hiring Manager"` (capital M) while `RoleType` and every other reference in the same file used `"Hiring manager"` (lowercase m). This passed frontend TypeScript (both are just strings) but failed backend Pydantic validation (`Literal["Hiring manager", ...]`) with a 422, surfaced confusingly as `[object Object]` until the error-display bug (next item) was also fixed. Any agent created before this fix has the bad casing baked into its stored data - must be deleted and re-added, cannot be fixed by editing in place.

3. **Frontend error display showed `[object Object]` instead of the real validation error.** FastAPI returns structured (array/object) validation error details, not plain strings - `InterviewRoomLive.tsx` needed `typeof startData.detail === 'string' ? startData.detail : JSON.stringify(startData.detail)` to actually surface what was wrong. Fixed.

4. **`backend/.env` had two lines using `KEY: value` (colon) instead of `KEY=value` (equals)** for `AGORA_CUSTOMER_ID`/`AGORA_CUSTOMER_SECRET` - `python-dotenv` silently failed to parse these on every reload (visible as a recurring warning), meaning those two env vars were never actually being loaded. Fixed the syntax. **The Customer ID/Secret pasted into chat while diagnosing this were exposed for a second time (same pair from an earlier session) - need to be rotated in Agora Console again.**

5. **Unhandled `ValueError` in `POST /sessions/start` surfaced as a raw, unhelpful 500.** `build_initial_queue()` correctly throws when no agent has `turnTaking.canOpen=True`, but the route didn't catch it - now wrapped in a try/except returning a clean `400` with the real message via `HTTPException`.

6. **React Strict Mode double-invocation bug in `InterviewRoomLive.tsx` - this was the actual cause of "connected but no audio."** The session-start `useEffect` had no guard, so React's deliberate dev-mode double-invocation ran the ENTIRE start sequence (token fetch, `/sessions/start`, Agora join) twice. The first attempt's real Agora `session.start()` call collided with the second ("TaskConflict: session with the same name already exists") and failed; the second succeeded, but the first attempt's cleanup function ran `leaveChannel()` unconditionally, likely tearing down the just-established audio connection from the second attempt. Fixed with a `hasStartedRef` guard so the actual start logic only runs once regardless of Strict Mode's double-invoke, and removed the premature `leaveChannel()`/`setActiveSpeakerId(null)` from the effect's cleanup (real cleanup now only happens via the explicit `handleClose` exit action, not an unmount that Strict Mode fakes).

---

## 4. Known remaining gaps, still open

- **`voice.provider` field in the builder (e.g. "elevenlabs") is not respected by the backend** - `start_session_agent()` hardcodes `MiniMaxTTS` regardless of what the UI shows. Cosmetic mismatch, not yet reconciled.
- **The per-agent "Talk" button in `AgentConfigForm.tsx` is still a stub** (`alert('Talk function not fully implemented yet')`) - the single-agent-test feature from the original Vapi-restructure brief, separate from the full-panel `/interview-room` flow this update focused on.
- **Supabase steps 13-15 (auth UI, `saveProject` actually persisting, a panel list query) are still not done** - the current live-test flow reads directly from the in-memory `builderStore`, bypassing persistence entirely, which is correct for testing but means nothing survives a page refresh yet.
- **Knowledge base / seed Q&A + rubric schema extensions** (proposed in the previous update - `idealAnswerNotes` per seed question, `rubric` field per scoring competency) - still not implemented in `panel.py`, `builderStore.ts`, or the form components.
- **`swap_agent_persona()`'s exact `update()` field shape** is still an educated guess (matches the Join endpoint's `llm`/`tts` nesting), not independently confirmed against the real Update REST endpoint's documented body - worth a live test the first time a real cross-agent handoff actually fires mid-interview.
- **Multi-agent-in-channel vs. single-instance-persona-swap** - still flagged as an open decision to revisit, not resolved.
- Final structured assessment generation and the AI-disclosure UI - not started.

---

## 5. New debugging lessons

18. **Claude cannot write files directly to the user's machine, only its own sandbox - even when it looks like it did (e.g., accepting a real Windows path as a `create_file` argument).** Every fix in this session had to be manually copied from a presented file into the actual project. This was re-confirmed multiple times this session and needs to stay assumed by default going forward, not re-discovered each time.
19. **A UI element that "looks wired" (has an `onClick`-shaped prop passed to it, follows the right visual pattern) can still have zero actual event handling underneath** - the `Switch` bug wasn't a logic error, it was a component with literally no click handler at all, despite looking indistinguishable from a working toggle. When something "won't toggle," check the component's actual JSX for a missing handler before assuming it's a state-management or logic problem.
20. **React 18 Strict Mode's dev-only double-invocation of effects is a real, common source of "works once, breaks with a real external side effect" bugs** - especially for anything calling a stateful external API (starting a live session, joining a channel) inside a bare `useEffect(() => {...}, [])`. Any effect that performs a real one-time side effect (not just local state) needs a `useRef` guard in this codebase's pattern, not just a `cancelled` flag, since the cleanup function itself still runs and can undo real work.
21. **FastAPI's validation error `detail` field is structured (array/object), not a plain string** - any frontend code doing `error.detail` needs to handle both cases (`typeof === 'string'` check + `JSON.stringify` fallback) or risk showing `[object Object]` instead of the actual problem.
22. **A `.env` value pasted into a chat conversation for debugging should be treated as compromised even the second time it happens** - rotate credentials again, don't assume "we already flagged this once" is protection against re-exposure in a later message.
