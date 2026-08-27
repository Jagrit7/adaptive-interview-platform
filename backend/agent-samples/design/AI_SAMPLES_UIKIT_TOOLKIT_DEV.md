# Cross-Repository Development Guide

**Location**: `agent-samples/design/AI_SAMPLES_UIKIT_TOOLKIT_DEV.md`

This guide explains how to develop across the five Agora Conversational AI repositories. Read this file at the start of development sessions for context on the workflow, git hooks, and package management.

## Repository Overview

**Repositories**:

- `agent-samples/` - Sample applications (GitHub: AgoraIO-Conversational-AI/agent-samples)
- `agent-client-toolkit/` - Core SDK, published on npm as `agora-agent-client-toolkit` (GitHub: AgoraIO-Conversational-AI/agent-client-toolkit-ts)
- `agent-ui-kit/` - UI components (GitHub: AgoraIO-Conversational-AI/agent-ui-kit)
- `server-custom-llm/` - Custom LLM server, Python/Node.js/Go (GitHub: AgoraIO-Conversational-AI/server-custom-llm)
- `server-mcp-memory/` - MCP memory server, Python/Node.js/Go (GitHub: AgoraIO-Conversational-AI/server-mcp)

**Package Installation**: Samples install toolkit from npm and ui-kit from GitHub:

```json
"agora-agent-client-toolkit": "^1.1.0",
"@agora/agent-ui-kit": "github:AgoraIO-Conversational-AI/agent-ui-kit#main"
```

---

## Development Workflow

### When to Edit Each Repository

**agent-client-toolkit** - Edit when:

- Fixing bugs in AgoraVoiceAI or core SDK logic
- Adding new features to the SDK
- Changing SDK interfaces or behavior

**agent-ui-kit** - Edit when:

- Fixing bugs in domain-specific components (AgentVisualizer, Conversation, Message, SettingsDialog, SessionPanel, AvatarVideoDisplay, VideoGrid, ThymiaPanel, ShenPanel)
- Adding new domain-specific components for voice AI
- Changing component props or behavior
- Adding shared types for integration components (e.g., `src/types/shen-types.ts`)
- Adding SDK-agnostic hooks (e.g., `useThymia`, `useRTMSubscription`) — these live in ui-kit subpath exports (`@agora/agent-ui-kit/thymia`, `@agora/agent-ui-kit/rtc`, `@agora/agent-ui-kit/session`)
- Note: Sample apps use shadcn/Tailwind for generic UI (buttons, inputs, layout). Only edit ui-kit for voice AI domain components.
- Note: Hooks that import external SDKs (e.g., Shen.AI) belong in the sample app, not ui-kit. Only SDK-agnostic hooks and types go in ui-kit.

**agent-samples** - Edit when:

- Fixing bugs in sample apps (VoiceClient, VideoAvatarClient)
- Adding new sample applications
- Updating documentation or configuration
- Changing styling or theming (edit `globals.css` and Tailwind classes, not ui-kit)
- Updating local utilities in `lib/utils.ts` (cn, renderMarkdownToHtml, etc.)

**server-custom-llm** - Edit when:

- Changing the LLM proxy pipeline (tool execution, conversation memory, RAG)
- Adding new endpoints or modifying streaming behavior
- Adding custom tools to `tools.{py,js,go}`
- Adding or modifying integration modules (e.g., `node/integrations/thymia/`, `node/integrations/shen/`)
- Changes should be made in all three languages (Python, Node.js, Go) to keep parity where applicable. Integration modules (Thymia, Shen) are currently Node.js only.

**server-mcp-memory** - Edit when:

- Changing MCP tool behavior (save, search, list, delete, compact, log)
- Modifying SQLite schema or FTS5 search logic
- Changing the MCP JSON-RPC protocol handling
- Changes should be made in all three languages (Python, Node.js, Go) to keep parity

---

## Making Changes to Toolkit or UI-Kit

When fixing issues that require changes to `agent-client-toolkit` or `agent-ui-kit`:

### 1. Local Symlink Development (Preferred)

For iterative development, symlink the ui-kit package to use local source:

```bash
# In sample app package.json, change:
"@agora/agent-ui-kit": "github:AgoraIO-Conversational-AI/agent-ui-kit#main"
# To:
"@agora/agent-ui-kit": "file:../../agent-ui-kit"

# Then install in BOTH repos:
cd agent-ui-kit && npm install --legacy-peer-deps
cd agent-samples/react-video-client-avatar && npm install --legacy-peer-deps

# Edit ui-kit source directly, rebuild, and test:
cd agent-ui-kit/packages/uikit
# Edit src/... files
npm run build   # or npx tsup --no-dts for quick JS-only build
# Sample app hot-reloads with changes
```

**Gotchas with symlinks:**

- Must `npm install` in both the ui-kit AND the sample app
- `agora-rtc-sdk-ng` must be in ui-kit peerDependencies
- Remember to revert to GitHub reference before committing

### 2. Quick Testing via node_modules

For one-off fixes, edit files in `node_modules` directly:

```bash
cd agent-samples/react-voice-client
# Edit node_modules/@agora/agent-ui-kit/dist/...
npm run dev  # Test the fix works
```

### 3. Copy Changes to Source Repository

Once the fix works, apply it to the source repo:

```bash
# For toolkit (published on npm — edit source repo, publish new version):
# Edit in ../../../agent-client-toolkit/src/...
# Then: npm version patch && npm publish

# For ui-kit — edit source directly:
# Edit ../../../agent-ui-kit/packages/uikit/src/...
```

### 4. Update Documentation

Update the README in the repo you modified:

- `agent-client-toolkit/README.md` - Document new SDK features/APIs
- `agent-ui-kit/README.md` - Document new component props/usage
- `agent-samples/AGENT.md` - Note breaking changes if any

### 5. Commit and Push

```bash
cd agent-client-toolkit  # or agent-ui-kit
git add .
git commit -m "feat: description"  # or "fix:", "docs:", etc.
git push origin main
```

**⚠️ IMPORTANT - Never Use --no-verify**:

- Never use `git commit --no-verify` or `git commit -n`
- Pre-commit hooks check ESLint, Prettier, secrets, commit message format
- If hooks fail, fix the errors instead of bypassing them
- ESLint errors: `cd <project-dir> && npx eslint <file>`
- Prettier errors: `npx prettier --write <file>`
- Commit-msg hook blocks "claude" references (case-insensitive)

### 6. Update Samples to Use Latest Changes

After publishing a new toolkit version to npm or pushing to ui-kit on GitHub, update samples:

```bash
cd agent-samples/react-voice-client
# For toolkit (npm): update version in package.json or run:
npm install agora-agent-client-toolkit@latest --legacy-peer-deps
# For ui-kit (GitHub): fresh install pulls latest:
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run dev  # Test with latest packages
```

---

## Making Changes to Samples Only

For changes that only affect sample apps (not toolkit/ui-kit):

**Package manager:** Use **npm** only (no pnpm or yarn). Always use `--legacy-peer-deps` flag due to agora-rtm peer dependency requirements. Do not commit pnpm-lock.yaml or yarn.lock files.

### 1. Edit and Test

```bash
cd agent-samples/react-voice-client
# Edit files
npm run dev  # Test changes
```

### 2. Fix Linting Before Committing

```bash
# TypeScript/JavaScript:
cd react-voice-client  # or react-video-client-avatar
npx eslint <file>
npx prettier --write <file>

# Markdown:
npx prettier --write AGENT.md simple-backend/README.md
```

### 3. Commit and Push

```bash
cd agent-samples
git add .
git commit -m "feat: description"  # NEVER use --no-verify!
git push origin main
```

---

## Making Changes to Server Repos

The two server repos (`server-custom-llm` and `server-mcp-memory`) each have implementations in Python, Node.js, and Go. All three languages provide the same endpoints and behavior — keep them in parity.

### Language-Specific Notes

**Python**: No build step. Just run the server directly.

**Node.js**: Requires Node 18+ (system default may be 16). Use `nvm use 18` before running. Run `npm install` in the `node/` directory before first use.

**Go (server-mcp-memory only)**: Requires `CGO_ENABLED=1` and the `-tags sqlite_fts5` build flag for FTS5 support. Always use:

```bash
CGO_ENABLED=1 go run -tags sqlite_fts5 .
```

### Running Servers Locally

```bash
# Custom LLM Server
cd server-custom-llm/python && LLM_API_KEY=sk-... python3 custom_llm.py     # port 8100
cd server-custom-llm/node   && THYMIA_ENABLED=true SHEN_ENABLED=true LLM_API_KEY=sk-... node custom_llm.js  # port 8101
cd server-custom-llm/go     && LLM_API_KEY=sk-... go run .                   # port 8102

# MCP Memory Server
cd server-mcp-memory/python && python3 mcp_server.py                         # port 8090
cd server-mcp-memory/node   && node mcp_server.js                            # port 8091
cd server-mcp-memory/go     && CGO_ENABLED=1 go run -tags sqlite_fts5 .      # port 8092
```

### Testing Server Repos

Both repos have automated test scripts in `test/` that cover happy paths and failure paths. Tests validate server structure and error handling without requiring external services.

```bash
# Run all languages
cd server-custom-llm && bash test/run_all.sh
cd server-mcp-memory && bash test/run_all.sh

# Run a single language
bash test/run_all.sh python
bash test/run_all.sh node
bash test/run_all.sh go
```

The test runner starts the server, runs curl-based tests, and cleans up automatically.

### Exposing to the Internet

Both servers need a tunnel for the Agora ConvoAI Engine to reach them:

```bash
# Install cloudflared (macOS)
brew install cloudflare/cloudflare/cloudflared

# Tunnel to Custom LLM Server
cloudflared tunnel --url http://localhost:8100

# Tunnel to MCP Memory Server
cloudflared tunnel --url http://localhost:8090
```

### Environment Variables

**server-custom-llm**:

| Variable          | Description              | Default                     |
| ----------------- | ------------------------ | --------------------------- |
| `LLM_API_KEY`     | API key for LLM provider | _(required)_                |
| `LLM_BASE_URL`    | LLM API base URL         | `https://api.openai.com/v1` |
| `LLM_MODEL`       | Default model name       | `gpt-4o-mini`               |
| `THYMIA_ENABLED`  | Enable Thymia module     | `false`                     |
| `SHEN_ENABLED`    | Enable Shen module       | `false`                     |

**server-mcp-memory**: No API keys required. Uses CLI flags or env vars for port, host, and DB path:

| Option  | Env Var   | CLI Flag    | Default              |
| ------- | --------- | ----------- | -------------------- |
| Port    | `PORT`    | `--port`    | `8090`/`8091`/`8092` |
| Host    | `HOST`    | `--host`    | `0.0.0.0`            |
| DB path | `DB_PATH` | `--db-path` | `mcp_memory.db`      |

### Adding Features to Server Repos

1. Implement in one language first, get it working and tested
2. Port to the other two languages with identical behavior
3. Update the language-specific README (`python/`, `node/`, `go/`) if needed
4. Update the top-level README only for features common to all languages
5. Run `bash test/run_all.sh` to verify all three languages pass

---

## Package Version Management

### Current Strategy: Hybrid (npm + GitHub)

The toolkit is published on npm. The ui-kit is still installed from GitHub:

```json
"agora-agent-client-toolkit": "^1.1.0",
"@agora/agent-ui-kit": "github:AgoraIO-Conversational-AI/agent-ui-kit#main"
```

**Toolkit (npm)**:

- Proper semantic versioning
- Update via `npm install agora-agent-client-toolkit@latest`
- Version pinned in package.json

**UI-Kit (GitHub)**:

- Samples always get latest fixes on fresh install
- No version number management

**Fresh install process**:

```bash
cd agent-samples/react-voice-client
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### Publishing Toolkit Updates

```bash
cd agent-client-toolkit
npm version patch  # or minor/major
npm run build
npm publish
git push origin main --follow-tags
```

**Updating samples**:

```bash
cd agent-samples/react-voice-client
npm install agora-agent-client-toolkit@latest --legacy-peer-deps
```

### Future: Publish UI-Kit to npm

When `@agora/agent-ui-kit` is also published to npm, update samples:

```json
"@agora/agent-ui-kit": "^0.5.0"
```

---

## Repository Structure

```
agent-samples/           # Sample applications
├── react-voice-client/
├── react-video-client-avatar/
├── simple-voice-client-no-backend/
├── simple-voice-client-with-backend/
├── simple-backend/
├── recipes/             # Integration recipes (thymia.md, therapist.md)
└── design/              # Architecture docs

agent-client-toolkit/    # Core SDK (agora-agent-client-toolkit on npm)
└── src/                 # Main package source

agent-ui-kit/            # UI components (@agora/agent-ui-kit)
└── packages/
    └── uikit/           # Main package (exports: ., ./thymia, ./rtc, ./session)

server-custom-llm/       # Custom LLM proxy (OpenAI-compatible)
├── python/              # FastAPI + uvicorn (port 8100)
├── node/                # Express (port 8101)
│   └── integrations/    # Thymia, Shen modules (RTM + Agent Update API)
├── go/                  # Gin (port 8102)
└── test/                # Automated test scripts

server-mcp-memory/       # MCP memory server (SQLite + FTS5)
├── python/              # Starlette + uvicorn (port 8090)
├── node/                # Express + better-sqlite3 (port 8091)
├── go/                  # Gin + go-sqlite3 (port 8092)
└── test/                # Automated test scripts
```

---

## Architecture Notes

For the full design rationale (singleton pattern, dual transport, PTS synchronization, framework-agnostic core), see [`AI_SAMPLES_DESIGN.md`](./AI_SAMPLES_DESIGN.md).

### AgoraVoiceAI Quick Reference

The toolkit provides `AgoraVoiceAI` as the main class. Create an instance via `AgoraVoiceAI.init()`, connect with `connect()`, and clean up with `disconnect()`. The instance manages both RTC and RTM connections internally and exposes transcript events, agent speaking state, and message sending.

---

## Git Hooks

The three front-end repositories (agent-samples, agent-client-toolkit, agent-ui-kit) use git hooks to enforce code quality:

### Pre-commit Hook

**Location**: `.git/hooks/pre-commit`

**What it checks**:

- ESLint for TypeScript/JavaScript files
- Prettier formatting for all files
- Secret detection (API keys, tokens, credentials)

**How it works**:

```bash
# For React projects (react-voice-client, react-video-client-avatar):
# Hook cd's into project directory before running ESLint
# This ensures project-specific .eslintrc.js is used

# Example from agent-samples pre-commit:
for file in $TS_FILES; do
  project_dir=$(echo "$file" | cut -d'/' -f1)
  if [[ "$project_dir" == react-* ]]; then
    (cd "$project_dir" && npx eslint "$(basename $(dirname $file))/$(basename $file)")
  fi
done
```

**If pre-commit fails**:

```bash
# Fix ESLint errors:
cd react-voice-client  # or react-video-client-avatar
npx eslint <file>
# Fix errors manually, then re-run to verify

# Fix Prettier errors:
npx prettier --write <file>
```

### Commit-msg Hook

**Location**: `.git/hooks/commit-msg`

**What it checks**:

- Blocks commits with "claude" in the message (case-insensitive)
- Enforces lowercase first character in commit message

**Example failures**:

```bash
git commit -m "Claude helped fix this"
# ❌ Error: commit message must not mention Claude

git commit -m "Fix bug"
# ❌ Error: commit message should start with lowercase
```

**Correct format**:

```bash
git commit -m "fix: video track not re-enabling"
git commit -m "feat: add shouldSubscribe filters to RTCHelper"
git commit -m "docs: update README with video API"
```

### Never Use --no-verify

**⚠️ CRITICAL**: Never use `git commit --no-verify` or `-n` flag

**Why**:

- Bypasses ESLint → introduces linting errors
- Bypasses Prettier → introduces formatting inconsistencies
- Bypasses secrets detection → risk of committing credentials
- Bypasses commit-msg validation → allows blocked words

**If hooks fail**:

- Fix the errors instead of bypassing
- Hooks protect code quality and security
- Hooks ensure consistent style across the team

---

## Quick Reference

### Check Installed Package Versions

```bash
cd agent-samples/react-voice-client
npm list agora-agent-client-toolkit
npm list @agora/agent-ui-kit
```

### Force Fresh Install

```bash
cd agent-samples/react-voice-client
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### Run Backend Tests

```bash
cd agent-samples/simple-backend
pytest                       # All tests
pytest tests/test_agent.py   # Specific file
```

### Dev Servers

**Note:** The React clients require Node.js >= 22 (Next.js 16 + React 19). Use `nvm use 22`. Server repos only need Node 18+.

```bash
# Backend (port 8082)
cd agent-samples/simple-backend
PORT=8082 python3 local_server.py

# Voice Client (port 8083)
cd agent-samples/react-voice-client
npm run dev

# Video Client (port 8084) — uses --webpack flag (Turbopack incompatible with Shen WASM)
cd agent-samples/react-video-client-avatar
npm run dev
```

### Run Server Tests

```bash
# Custom LLM — all languages
cd server-custom-llm && bash test/run_all.sh

# MCP Memory — all languages
cd server-mcp-memory && bash test/run_all.sh

# Single language
bash test/run_all.sh python   # or node, go
```

### Pull All Repos

```bash
cd /Users/benweekes/work/convoai
for dir in agent-samples agent-client-toolkit agent-ui-kit server-custom-llm server-mcp-memory; do
  echo "--- $dir ---" && (cd "$dir" && git pull)
done
```

### Port Reference

| Service            | Python | Node.js | Go   |
| ------------------ | ------ | ------- | ---- |
| MCP Memory Server  | 8090   | 8091    | 8092 |
| Custom LLM Server  | 8100   | 8101    | 8102 |
| Sample Backend     | 8082   | --      | --   |
| Voice Client (dev) | --     | 8083    | --   |
| Video Client (dev) | --     | 8084    | --   |

---

## Related Documents

- [`AI_SAMPLES_DESIGN.md`](./AI_SAMPLES_DESIGN.md) — Architecture rationale for the three-package model
- [`VIBE_CODING_DESIGN.md`](./VIBE_CODING_DESIGN.md) — Why vibe-coding repos flatten this architecture for AI platforms
