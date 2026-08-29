# Changes: fixed speech providers + knowledge base

Two features, plus four bugs found along the way. Files marked **replace** are
complete and drop in over the existing ones. Two small files need a hand edit
because they contain fixes you debugged and I didn't want to hand you a whole
replacement to re-verify.

---

## 1. Setup first

```bash
cd backend
pip install python-multipart      # required for the file-upload endpoint
```

`python-multipart` is the only new dependency. No new API keys, no new env vars.

Create two empty files so the new packages import:

```
backend/app/config/__init__.py
backend/app/knowledge/__init__.py     (content provided)
```

---

## 2. Files to replace

### Backend
| File | New? | What changed |
|---|---|---|
| `app/config/voice_profiles.py` | new | Language registry. 18 languages → STT/TTS vendor, model, voice. |
| `app/config/__init__.py` | new | Empty. |
| `app/knowledge/store.py` | new | Upload parsing, retrieval, prompt blocks. |
| `app/knowledge/__init__.py` | new | Re-exports. |
| `app/routes/config.py` | new | `GET /config/languages`. |
| `app/routes/knowledge.py` | new | `POST /knowledge/parse`, `POST /knowledge/parse-text`. |
| `app/schemas/panel.py` | replace | `Panel.language`; `Knowledge`/`KnowledgeItem`; `Voice` kept but ignored. |
| `app/orchestrator/agent_launcher.py` | replace | Registry-driven speech; knowledge in prompt; `update()` fix. |
| `app/orchestrator/scorer.py` | replace | Grades against your ideal answers; returns coverage + gaps. |
| `app/orchestrator/state.py` | replace | Tracks asked/pending knowledge items. |
| `app/orchestrator/orchestrator.py` | replace | Bank exhaustion ends a visit; two bug fixes. |
| `app/routes/sessions.py` | replace | Resolves language/voice; injects bank questions. |
| `app/main.py` | replace | Registers the two new routers. |

### Frontend
| File | New? | What changed |
|---|---|---|
| `lib/languages.ts` | new | Language list + `previewVoice`. |
| `store/builderStore.ts` | replace | `language` at panel level; `knowledge` per agent; `voice` removed. |
| `app/builder/KnowledgeBaseForm.tsx` | new | Upload / paste / edit UI. |
| `app/builder/AgentConfigForm.tsx` | replace | Voice step is language-only; new Knowledge step (now 8 steps). |
| `app/builder/PanelReadOnlyView.tsx` | replace | Voice section rewritten; Knowledge section added. |
| `components/ui/FormElements.tsx` | replace | `Field` now accepts the `style` prop it was already being passed. |
| `components/ui/AgentDetailModal.tsx` | replace | Reads panel language; shows knowledge source. |

---

## 3. Two hand edits

### `app/interview-room/InterviewRoomLive.tsx`

The panel payload has to carry the language now, or every session silently runs
in English.

**Line ~14**, add `language` to the destructure:

```ts
// before
const { agents, scorer, projectName, activeSpeakerId, setActiveSpeakerId } = useBuilderStore();
// after
const { agents, scorer, projectName, language, activeSpeakerId, setActiveSpeakerId } = useBuilderStore();
```

**Line ~78**, inside the `/sessions/start` body:

```ts
// before
panel: { projectName, agents, scorer },
// after
panel: { projectName, language, agents, scorer },
```

Optional — surface knowledge-base progress in the status line. In
`handleNextTurn`, after `setIsFinished(data.is_finished)`:

```ts
const progress = data.questions_total > 0
  ? ` · Q${data.questions_asked}/${data.questions_total}`
  : '';
setStatus(data.is_finished ? 'Interview finished' : `Listening (${data.action})${progress}`);
```

### `app/builder/page.tsx` (optional)

Language now lives on the panel, so the top bar is a natural home for it
alongside the project name. The Voice step already exposes it, so skip this if
you'd rather not touch the page.

---

## 4. What changed conceptually

### Providers

The user picks a language. Everything else is derived in
`voice_profiles.py` — STT vendor and model, TTS vendor and model, and the voice
itself. There is no provider dropdown anywhere any more.

The pair is **Deepgram `nova-3` + MiniMax `speech-2.6-turbo`**, chosen because
both are on Agora's *managed* preset path: no vendor API keys, nothing new in
`.env`. That's confirmed in the SDK's `presets.py` (`DeepgramPresetModels`,
`MiniMaxPresetModels`), and the test suite asserts the built config objects carry
no `key` field.

Voice IDs are real MiniMax system voice IDs from their published list, not
invented. Each agent in a panel is assigned a different voice from the language's
pool, deterministically by position, wrapping if the panel is larger than the
pool.

**Language is panel-level, not per-agent.** The session runs one Agora instance
whose STT language is fixed at Join time, and `session.update()` can't change it
(see below). A per-agent language would be a setting the backend cannot honour,
so the UI doesn't offer one.

### Knowledge base

Per agent, two modes:

- **Trust the model** — unchanged behaviour.
- **Use a knowledge base** — upload CSV / TSV / JSON / JSONL / Markdown / TXT.
  A CSV wants a `question` column; `answer`, `tags`, `difficulty` are optional.
  Header matching is fuzzy (`Q`, `Model Answer`, `Topic`, `Expected Answer` all
  work). Text files can use `Q:` / `A:` blocks or one question per line.

Plus a **strict** toggle: on, the agent asks nothing outside your list and ends
its turn when the list runs out; off, it covers your list first then improvises.

Three things make this work, and only one of them is retrieval:

1. **Control flow, not prompting.** `sessions.py` picks the next unasked question
   in Python and pushes it to the agent via `session.think()`. The model chooses
   how to phrase it, never what to ask. Staying inside your bank is enforced, not
   requested.
2. **Grounded scoring.** The scorer receives the ideal answer for the question
   that was actually asked and grades against it, returning `coverage` (0–1) and
   `missing_points`. This is where a knowledge base pays off most — it makes
   scores comparable between candidates instead of drifting with the model's mood.
3. **Retrieval**, used only to match a candidate's answer back to the right
   knowledge item when the asked question isn't known. TF-IDF over stdlib, no
   vector DB: at panel scale (tens to low hundreds of Q&A pairs) lexical
   retrieval matches embeddings closely and adds no dependency, latency or cost.
   If a bank ever passes a few thousand items, `retrieve()` is the only function
   that needs replacing.

Nothing new is stored. Knowledge lives inside each agent in the `Panel` JSON, so
it rides along in the Supabase `config` jsonb column you already have.

---

## 5. Four bugs found

1. **`session.update()` would have crashed on the first handoff.** The SDK
   signature is `update(self, properties)` — one positional argument. The code
   called `session.update(llm={...}, tts={...})`, which raises `TypeError`. It
   never surfaced because no cross-agent handoff has run yet. Fixed.

2. **TTS voice probably can't be swapped mid-session.**
   `UpdateAgentsRequestProperties` declares only `token`, `llm`, `mllm` — no
   `tts`. The model allows extra keys so `tts` is still sent on the chance the
   REST endpoint honours it, but assume for now the whole panel speaks with the
   opening agent's voice. Per-agent voices need the multi-instance architecture
   that's still open in your context doc. Everything is wired for it already.

3. **Handoff triggers left state and reality disagreeing.** The trigger branch
   called `_end_current_visit()`, which also pops the queue and reassigns
   `state.current_agent_id`. So state tracked the queue head while the returned
   decision — and therefore the live persona swap — pointed at the trigger
   target, and the two stayed out of sync for the rest of the session. Split into
   `_close_visit()` (bookkeeping) and `_end_current_visit()` (queue advance).
   A hallucinated agent id in `triggered_agent_ids` is now also filtered instead
   of raising `KeyError` mid-interview.

4. **Every agent looked fully satisfied before its first score.**
   `AgentSessionState.competency_scores` starts empty, and `satisfaction()` reads
   an empty dict as "nothing to satisfy" → 1.0. So `decide_next_step` ended an
   agent's visit after one question. New `seed_agent_states()` pre-creates each
   declared competency at 0/uncovered at session start, so 1.0 now only means
   "genuinely has no competencies". Called from `POST /sessions/start`.

Bugs 3 and 4 both predate these changes and would have shown up as "the panel
moves on far too quickly" once real handoffs started firing.

---

## 6. Smoke test

```bash
uvicorn app.main:app --reload
curl localhost:8000/config/languages | head -c 400
curl -F "file=@sample-knowledge-base.csv" localhost:8000/knowledge/parse
```

Then in the builder: pick a language on any agent's Voice step, go to Knowledge,
upload the sample CSV, switch to "Use a knowledge base", and start the panel. The
opening agent should ask your first question rather than one of its own.

---

## 7. Still open (unchanged by this work)

- Supabase steps 13–15 — auth UI, `saveProject` actually persisting.
- The per-agent "Talk" button is still a stub.
- Final structured assessment generation, AI-disclosure UI.
- Multi-instance vs. single-instance persona swap — now with a concrete cost
  attached: it's what per-agent voices need.
