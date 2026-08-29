# Adaptive Interview Platform — Project Context (Updated)

This supersedes the earlier PROJECT_CONTEXT.md. Sections unchanged from before are summarized briefly with a pointer; new/changed sections are in full.

---

## Unchanged from earlier context (see original doc for full detail)

- Problem statement (ps11), one-week hackathon, separate from the earlier 8-hour Agora hackathon
- Platform-not-fixed-panel decision, the 5 planned recipes (only SDE panel built)
- Single-Agora-agent-instance-with-persona-hot-swap execution model (not true multi-agent-in-channel)
- No RAG/knowledge-base retrieval for question generation - grounding via seed questions + rubrics instead
- Tech stack: FastAPI backend, Next.js frontend (separate folders), Agora `agora-agents` Python SDK

---

## What's changed since the last context doc

### 1. Frontend scope grew substantially beyond the original brief

The builder now has real, working config forms closely matching the schema, plus several pieces not in the original brief: `InterviewRoomScene`/`Window`, `PanelVisualizer`, `PanelTableGraphic`, `PanelReadOnlyView`, `AgentDetailModal`, glassmorphism dashboard tiles, and an apparent home-page redesign (`home-glassmorphism-hero-tiles.md`) despite an earlier explicit "don't touch the home page" instruction - worth reviewing visually, not yet done.

**The real Agent/Scorer schema now lives in `frontend/store/builderStore.ts`**, camelCase, structured as:
```
Agent: { id, identity{name,role,color,avatar}, voice{provider,voiceId,language,speakingStyle},
         behavior{systemPrompt,greetingMessage,fallbackMessage,scenarioBrief},
         logic{difficultyBand,seedQuestions,followUpAggressiveness,maxTurns},
         skills{rolePlayMode,loopUntilSatisfied,contradictionProbing},
         tools[], turnTaking{canOpen,handoffTriggers,priority}, scoring{competencies} }
Scorer: { competencies: [{name, weight, threshold}] }
```
This is a DIFFERENT shape from the original hand-written `recipes/sde_panel/config.json` (which used snake_case and an external `seed_questions.json` file reference). Both now coexist in the backend - see agent_launcher.py notes below.

**Known gap:** `saveProject()` in `builderStore.ts` is still a stub (`console.log`) - not yet wired to real persistence. This is being solved via Supabase (see section 4).

### 2. Vapi-style builder restructure requested and handed off

Instructions were written (`agent-builder-vapi-restructure.md`) to restructure the per-agent config UI from one long scrolling form into a tabbed layout (Identity / Voice / Prompt / Interview logic / Skills / Tools / Turn-taking+Scoring), with a persistent live summary strip and a "Talk" button to test one agent live without leaving the builder. Home page explicitly out of scope for this task. Status of implementation not yet confirmed visually.

### 3. Panel orchestration algorithm - FULLY LOCKED

This replaces the earlier fixed-sequential-loop sketch entirely. Final algorithm:

**Opening:** among agents with `turnTaking.canOpen`, highest `priority` opens (high > medium > low, ties by list order).

**Per-turn scoring (one LLM call per candidate answer, not two):** scores the current agent's `scoring.competencies` against the answer AND checks every agent's `turnTaking.handoffTriggers` text against the live transcript - including the current agent's own trigger. This is evaluated *semantically* by the LLM, not string-matched - free-text trigger conditions like "candidate gives a technically correct answer without addressing business impact."

**Satisfaction is per-agent, not per-panel** - the fraction of that agent's competencies currently scored at/above threshold. Not binary.

**Round-robin with revisits (not sequential completion):**
1. Current agent gets a "visit" - up to `logic.maxTurns` questions this visit (this field's meaning changed from "give up after N turns" to "N questions per visit, then reassess").
2. End of visit: recompute satisfaction, increment `visitCount`.
   - 100% satisfied -> done, removed from queue permanently.
   - Not satisfied but `visitCount >= logic.maxVisits` (NEW field, not yet in builderStore.ts) -> force-closed at whatever satisfaction reached, removed from queue. This is real signal for the final report, not a hidden failure.
   - Otherwise -> back of the queue for a future revisit.
3. A cross-agent `handoffTriggers` match can interrupt a visit early, before `maxTurns` is hit - this override takes priority over the round-robin.
4. **Interview ends when the queue is empty** - every agent either fully satisfied or force-closed.

**Still needed on the schema:** `logic.maxVisits` field added to `builderStore.ts`'s `Agent.logic` (backend `panel.py` already has it, frontend does not yet).

### 4. Backend orchestration code - written, partially unverified

Four new backend files, against the REAL camelCase schema (`panel.py`), not the old recipe shape:

- **`backend/app/schemas/panel.py`** - Pydantic models mirroring `builderStore.ts` exactly, `Agent`/`Scorer`/`Panel`, with `maxVisits` added.
- **`backend/app/orchestrator/state.py`** - `SessionState`: queue, per-agent `visit_count`/`competency_scores`/`force_closed`, transcript, `is_finished`. Built fresh per interview session, never saved as panel config.
- **`backend/app/orchestrator/scorer.py`** - `score_turn()`: builds one prompt scoring current-agent competencies + checking all agents' handoff triggers, calls Groq's `openai/gpt-oss-120b` with `response_format: json_object`, parses into `ScoreResult`. **This is now a REAL implementation, not a stub** (was `NotImplementedError` in the first draft).
- **`backend/app/orchestrator/orchestrator.py`** - `decide_next_step()`: the full locked algorithm above, implemented. `build_initial_queue()`, `apply_score_result()`, `_end_current_visit()` helpers.

**`backend/app/orchestrator/agent_launcher.py` was substantially rewritten**, keeping the original functions (now under a `LEGACY` section, still backing the standalone `test-voice` page which uses the old snake_case recipe format) and adding NEW functions for real sessions:
- `build_system_prompt_from_agent(agent: PanelAgent)` - same composition logic, works against the real schema, seed questions now read inline (`logic.seedQuestions`) rather than an external file reference.
- `start_session_agent(agent, channel, remote_uid)` - starts the one live Agora instance for a real session, returns `(agent_id, session)` - the `session` object is kept so it can be updated later without a new Join call.
- `swap_agent_persona(session, new_agent)` - **UNVERIFIED**. Calls `session.update(llm=..., tts=...)` as a best guess at the real `agora_agent` SDK method/shape for hot-swapping a running instance's persona. This has NOT been confirmed against the actual installed package - check `help(session)` or the SDK source before trusting the orchestrator's `SWITCH_AGENT` path in production. This is the single riskiest unverified piece in the whole backend right now.

**LLM provider decision: Groq, for both use cases, different models:**
- Conversational agent's "brain" (inside `start_session_agent`, plugged into Agora's pipeline via `agora_agent`'s `Groq` class): `openai/gpt-oss-20b` - favors speed since this generates every turn of live speech.
- Scorer (`scorer.py`, plain backend call via the `groq` Python package, NOT through Agora): `openai/gpt-oss-120b` - favors reasoning quality, can tolerate extra latency since it runs after a transcript, not during speech generation.
- Both confirmed as real, current, production-tier Groq models supporting `response_format: json_object`.
- Requires `GROQ_API_KEY` in `backend/.env` and `pip install groq`.
- This REPLACES an earlier OpenAI-for-voice-agent default and an earlier Cerebras-for-scorer proposal - Cerebras was reconsidered and dropped once it was clarified the scorer and the voice agent's LLM are two separate, differently-constrained calls (Cerebras' 5 req/min would have throttled live conversation if used for the voice agent, but was fine for the scorer; consolidating both onto Groq under one API key was judged simpler than splitting providers).

### 5. Remaining gaps before a real (non-test-voice) interview can run

In rough dependency order:
1. Panel save/persistence - being solved via Supabase (see section 6), not a custom FastAPI route as originally planned.
2. Verify `swap_agent_persona`'s actual SDK method/shape (see above - real risk, not yet checked).
3. Follow-up injection (same agent, another question, not a full switch) - no mechanism built yet, likely a lighter custom-instruction call, also unverified against the SDK.
4. **No design yet** for how the candidate's transcribed answer actually reaches the backend orchestrator in real time - decision needed on whether the frontend calls `/sessions/next` after each candidate turn (using the transcript stream `useAgoraVoiceClient.ts` already receives) or Agora pushes to a backend webhook. This blocks writing the session endpoints.
5. `POST /sessions/start` and `POST /sessions/next` routes - not yet written, depend on #4 being decided first.
6. Connecting the real `InterviewRoomScene`/`Window` frontend components (already scaffolded) to this backend flow, instead of the single-hardcoded-agent `test-voice` page.
7. Final structured assessment generation - not started.
8. AI-disclosure UI - not started.

### 6. Persistence and auth: Supabase, not custom FastAPI storage

Decision made to drop the earlier plan (`POST /panels` route + local JSON files under `backend/panels/`) in favor of Supabase directly from the frontend:

- `panels` table: `id`, `user_id` (FK to `auth.users`), `project_name`, `config` (jsonb - the whole `{agents, scorer}` payload), `created_at`.
- Row Level Security policy (`auth.uid() = user_id`) handles per-account isolation with zero custom backend code.
- `saveProject()` will call `supabase.from('panels').upsert(...)` directly from the frontend - FastAPI never touches Supabase or needs its own DB credentials for this. It only ever receives a full `Panel` JSON object when a session actually starts, same as before.
- **Setup status: steps 1-12 of the Supabase setup are DONE** (project created, credentials in `.env.local`, `panels` table created, RLS enabled and policy applied). **Steps 13-15 (frontend auth UI, wiring `saveProject`/a panel-list query to Supabase) are NOT yet done.**

### 7. Custom knowledge base / Q&A / metrics feature - proposed, not yet built

Person asked whether users should be able to supply their own questions/answers and scoring metrics. Answer: yes, and it requires no new subsystem (no RAG, no vector DB, no file uploads yet) - just two schema extensions to what already exists:

1. **`logic.seedQuestions`**: extend from `list[str]` to `list[{question: str, idealAnswerNotes: str}]` (optional second field) - lets a user note what a strong answer should cover, giving the scorer something concrete instead of inferring blind.
2. **`Scorer.competencies[].rubric`**: NEW field, `{weak: str, adequate: str, strong: str}`, editable per-panel in `ScorerConfigForm.tsx`. This replaces the hand-written `rubrics.json` (built for the SDE recipe) as the source of truth - that file's content becomes default pre-fill values for a recipe, not a fixed backend file `scorer.py` reads directly.

Both changes live inside the same `Panel` JSON already going into Supabase's `config` column - no new storage layer. Not yet implemented in `panel.py`, `builderStore.ts`, or the relevant form components.

---

## Hard-won debugging lessons

See original PROJECT_CONTEXT.md section 8 for the full numbered list (12 items) - still all valid, nothing there has changed. New lessons from this session:

13. **Windows PowerShell vs cmd matters for every shell command** - `Remove-Item -Recurse -Force` is PowerShell-only; cmd needs `rmdir /s /q`. Check which shell is actually active (prompt prefix) before assuming a command will work.
14. **Git "embedded repository" warnings are not optional to ignore.** Cloned repos (`agent-samples`, `agora-token-tools`) and a scaffolded `frontend/` each had their own `.git` folder, making git treat them as submodule-like embedded repos - meaning they would NOT be included when someone else clones the outer repo. Fixed by deleting the inner `.git` folders and re-adding as plain tracked files. Always check `git status` output shows individual files (not one folder-level entry) for any directory that was cloned or scaffolded separately.
15. **Secrets can get staged before a `.gitignore` exists or takes effect.** `backend/.env` was staged in an early `git add .` before the `.gitignore` was correctly named/placed - `git rm --cached` was needed to unstage it even after the `.gitignore` was fixed, since ignore rules don't retroactively unstage already-tracked files.
16. **A `.gitignore` saved without its leading dot (`gitignore` instead of `.gitignore`) is silently useless** - git never reads it, with no error, so everything it should have excluded gets added anyway. Always verify the file is *named* correctly, not just that its contents are correct.
17. **`create_file` (Claude's tool) writes to Claude's own sandbox, never the user's actual machine, even when given a real-looking absolute Windows path.** Every file meant for the real project has had to be downloaded via `present_files` and manually placed. This has caused real mistakes (see #11 in the original list) and needs to stay top of mind every time a file is generated for this project.
