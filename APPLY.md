# How to apply this update

This zip mirrors your project's folder structure exactly, so applying it is an
overlay: extract it on top and the files land where they belong.

The top-level folder inside is `adaptive-interview-platform/`, matching the
folder inside your 330 MB zip.

---

## Option A — apply to your working copy (recommended)

Your project is a git repo, so this is both the easiest and the safest route:
git shows you exactly what changed before you commit anything.

**PowerShell** (your project is on Windows — `cp -r` etc. won't work in cmd):

```powershell
# 1. Commit or stash anything in progress first
cd C:\path\to\adaptive-interview-platform
git status

# 2. Extract this update somewhere temporary
Expand-Archive -Path "$HOME\Downloads\adaptive-interview-platform-update.zip" `
               -DestinationPath "$HOME\Downloads\aip-update" -Force

# 3. Overlay it onto the project (parent folder, because the zip already
#    contains the adaptive-interview-platform\ folder name)
Copy-Item -Path "$HOME\Downloads\aip-update\adaptive-interview-platform\*" `
          -Destination "C:\path\to\adaptive-interview-platform" `
          -Recurse -Force

# 4. Review before committing
git status
git diff
```

`git diff` on the 8 replaced files is the real check. `git status` should show
13 new files and 8 modified ones, and nothing else.

Then:

```powershell
cd backend
pip install python-multipart
python -m tests.test_knowledge_and_voice
python -m tests.test_orchestrator
python -m tests.test_e2e
```

All three should print `PASS` lines and finish with "all checks passed" (54
checks total). If they do, the backend is wired correctly.

---

## Option B — update the 330 MB zip in place

Only worth doing if the zip is the artifact you're actually keeping. Zip tools
replace entries whose paths match and add the rest, so the other ~325 MB is left
untouched.

**PowerShell:**

```powershell
cd $HOME\Downloads
Expand-Archive -Path .\adaptive-interview-platform-update.zip `
               -DestinationPath .\aip-update -Force
cd .\aip-update
Compress-Archive -Path .\adaptive-interview-platform `
                 -DestinationPath ..\adaptive-interview-platform.zip -Update
```

The `cd` matters. `Compress-Archive` stores paths relative to the current
directory, so running it from inside `aip-update` produces
`adaptive-interview-platform\backend\...` entries that line up with the ones
already in the archive. Run it from anywhere else and you'll get a second,
wrongly-nested copy instead of a replacement.

**If you have 7-Zip** (faster, and it handles a 330 MB archive better than
`Compress-Archive`, which rewrites the whole file):

```powershell
cd $HOME\Downloads\aip-update
& "C:\Program Files\7-Zip\7z.exe" u ..\adaptive-interview-platform.zip adaptive-interview-platform\
```

`u` means update: replace matching entries, add new ones, leave everything else
alone.

**Verify it worked** — this should list 26 entries:

```powershell
Add-Type -A System.IO.Compression.FileSystem
$z = [IO.Compression.ZipFile]::OpenRead("$HOME\Downloads\adaptive-interview-platform.zip")
$z.Entries | Where-Object { $_.FullName -match 'voice_profiles|knowledge|languages\.ts|KnowledgeBaseForm' } |
  Select-Object FullName, Length, LastWriteTime
$z.Dispose()
```

Check `LastWriteTime` on those entries is today's date, not the original
2026-08-27. If it still shows the old date, the paths didn't match and you've
added a nested duplicate — delete the zip's copy and redo from the right folder.

---

## What's in the zip

**13 new files**

| Path | Purpose |
|---|---|
| `backend/app/config/__init__.py` | (empty) |
| `backend/app/config/voice_profiles.py` | Language → STT/TTS/voice registry |
| `backend/app/knowledge/__init__.py` | Re-exports |
| `backend/app/knowledge/store.py` | Upload parsing, retrieval, prompt blocks |
| `backend/app/routes/config.py` | `GET /config/languages` |
| `backend/app/routes/knowledge.py` | `POST /knowledge/parse`, `/parse-text` |
| `backend/sample-knowledge-base.csv` | 5-question fixture to test with |
| `backend/tests/test_knowledge_and_voice.py` | 21 checks |
| `backend/tests/test_orchestrator.py` | 11 checks |
| `backend/tests/test_e2e.py` | 22 checks, boots the real app |
| `frontend/lib/languages.ts` | Language list + voice preview |
| `frontend/app/builder/KnowledgeBaseForm.tsx` | Upload / paste / edit UI |
| `MIGRATION.md` | Full write-up of what changed and why |

**8 replaced files**

| Path | What changed |
|---|---|
| `backend/app/main.py` | Registers the two new routers |
| `backend/app/schemas/panel.py` | `Panel.language`, `Knowledge`, legacy `Voice` kept |
| `backend/app/orchestrator/agent_launcher.py` | Registry-driven speech, `update()` fix |
| `backend/app/orchestrator/orchestrator.py` | Bank exhaustion, 2 bug fixes |
| `backend/app/orchestrator/scorer.py` | Grades against your ideal answers |
| `backend/app/orchestrator/state.py` | Tracks asked/pending questions |
| `backend/app/routes/sessions.py` | Language resolution, question injection |
| `frontend/store/builderStore.ts` | `language` panel-level, `knowledge` per agent |
| `frontend/app/builder/AgentConfigForm.tsx` | Language-only Voice step, Knowledge step |
| `frontend/app/builder/PanelReadOnlyView.tsx` | Voice section rewritten, Knowledge added |
| `frontend/app/interview-room/InterviewRoomLive.tsx` | Sends `language`; shows Q progress |
| `frontend/components/ui/FormElements.tsx` | `Field` accepts `style` |
| `frontend/components/ui/AgentDetailModal.tsx` | Reads panel language, shows knowledge |

**No hand edits needed.** `InterviewRoomLive.tsx` is included with the three
changes already applied and typechecked — the diff against yours is 3 hunks and
nothing else. Every Strict Mode fix in that file is untouched. If you'd rather
apply them yourself, section 3 of `MIGRATION.md` still has the exact anchors.

---

## After applying

```powershell
# backend
cd backend
pip install python-multipart      # the only new dependency
uvicorn app.main:app --reload

# frontend, in a second terminal
cd frontend
npm run dev
```

Then: open the builder, pick a language on any agent's **Voice** step, go to the
new **Knowledge** step, upload `backend/sample-knowledge-base.csv`, and start the
panel. The opening agent should ask *your* first question rather than one of its
own.

---

## Known state after this update

`npx tsc --noEmit` reports 3 errors, all in `hooks/useAgoraVoiceClient.ts`
(`Cannot find module '@agora/agent-ui-kit'` and two type mismatches). Those are
pre-existing and unrelated — your tree had 7 errors before this update; the
other 4 were the `Field`/`style` mismatch, which is now fixed.
