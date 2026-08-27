# Vibe Coding — Design Decisions

This document explains why the vibe-coding repos flatten the agent-samples three-package architecture into self-contained single repos, and why that trade-off makes sense for AI coding platforms.

For the agent-samples design rationale, see [`AI_SAMPLES_DESIGN.md`](./AI_SAMPLES_DESIGN.md) and [`AI_SAMPLES_UIKIT_TOOLKIT_DEV.md`](./AI_SAMPLES_UIKIT_TOOLKIT_DEV.md).

---

## Three Projects, Three Audiences

| | agent-samples | vibe-coding (v0, Lovable) | agent-samples + Claude Code |
|---|---|---|---|
| **Who builds with it** | Developers (clone, install, code) | AI coding platforms via a single prompt | AI coding agent with full local access |
| **Who modifies it** | The developer, in an IDE | The AI platform, in response to natural language | Claude Code, with full codebase visibility |
| **How it's installed** | `npm install --legacy-peer-deps` | Platform imports the GitHub URL and generates a project | `npm install --legacy-peer-deps` (same as developer) |
| **How it's customized** | Fork the repo, edit code | Tell the platform "make the mic button bigger" | Describe changes in natural language, Claude Code edits source directly |

The vibe-coding repos exist because **v0 and Lovable have platform constraints** (no GitHub package installs, no node_modules visibility, sandboxed builds) that agent-samples' three-package model doesn't accommodate. Claude Code has none of these constraints — it works directly with the agent-samples codebase, can read into node_modules, and can install any package. This makes Claude Code the most capable AI coding approach for agent-samples.

---

## The agent-samples Three-Package Model

Agent-samples uses a three-layer architecture: toolkit (SDK), ui-kit (components), and samples (applications). The design philosophy is **domain components from ui-kit, generic UI from shadcn/Tailwind** — see [`AI_SAMPLES_DESIGN.md`](./AI_SAMPLES_DESIGN.md) for full details.

The key point for vibe-coding: even agent-samples doesn't use ui-kit for buttons, inputs, or layout — it reserves ui-kit for voice AI domain components and handles everything else locally with Tailwind and lucide-react.

---

## Why Vibe-Coding Flattens Everything

Vibe-coding takes the agent-samples "shadcn for generic UI" principle further: **when the AI platform is the developer, even domain-specific components should be generated locally**. These constraints are specific to v0 and Lovable — Claude Code working with agent-samples directly does not have them.

### 1. Package hosting: GitHub refs don't work on AI platforms

Both packages are installed from GitHub, not npm:

```json
"agora-agent-client-toolkit": "^1.1.0",
"@agora/agent-ui-kit": "github:AgoraIO-Conversational-AI/agent-ui-kit#main"
```

The toolkit is now published on npm as `agora-agent-client-toolkit`, but the ui-kit is still GitHub-only. v0 and Lovable cannot reliably install GitHub-hosted packages. Their build environments expect public npm registry packages. **The toolkit constraint has been removed**, but the ui-kit still can't be used on these platforms.

### 2. AI platforms can't see into node_modules

When v0 or Lovable regenerates or debugs code, it reads the project's source files. It cannot read into `node_modules/agora-agent-client-toolkit/dist/` to understand what `AgoraVoiceAI.connect()` does internally. The abstraction that helps human developers (hide complexity, expose clean API) hurts AI platforms (hide context, reduce ability to debug and modify).

With inline code, the platform sees every RTC event handler, every RTM message callback, and every transcript assembly step. When a user says "fix the transcript not updating," the AI can trace the entire flow.

### 3. AI platforms excel at generating UI — it's their core strength

Agent-ui-kit provides pre-built components like `AgentVisualizer`, `MicButton`, `Conversation`, and `Message`. For a developer, these save hours of work. But v0 and Lovable are purpose-built for generating React components from descriptions. Giving them a pre-built `MicButton` removes their ability to customize it — the user can't say "make the mic button pulse when listening" because the platform doesn't own that code.

This mirrors agent-samples' own design decision: even the developer-oriented samples use shadcn/Tailwind for generic UI instead of ui-kit primitives (Button, Card, Popover are exported by ui-kit but unused by the samples). Vibe-coding extends this to domain components too — the AI generates the agent orb, chat panel, and waveform visualizer locally because it needs to own them.

### 4. Platform-native component patterns

Each AI platform has conventions the AI understands deeply:
- **v0** generates shadcn/ui components in `components/ui/`, uses Next.js App Router patterns
- **Lovable** generates similar components in `src/components/ui/`, uses Vite + React patterns

Code that follows these conventions gets better AI modifications than code that imports from unfamiliar packages.

### 5. Fewer dependencies = fewer platform failures

Every npm dependency is a potential build failure on constrained platform sandboxes. By using only the two core Agora SDKs (`agora-rtc-sdk-ng` and `agora-rtm`) and no wrapper packages, we minimize the surface area for install failures.

---

## Why Inline Token Generation (v007)

Agent-samples uses an inline v007 token builder in Python (`core/tokens.py`, stdlib only — no pip-installable v007 package exists). Vibe-coding also generates v007 tokens inline, but in JavaScript using Web-standard APIs instead of Node.js APIs. The primary reason for the Web API approach is **Deno compatibility**.

### The Deno constraint

The Lovable variant uses **Supabase Edge Functions**, which run on **Deno** (not Node.js). The `agora-token` npm package cannot run in Deno:

| Blocker | Details |
|---------|---------|
| **100% CommonJS** | All files use `module.exports`/`require()`. No ESM entry point. [Issue #328](https://github.com/AgoraIO/Tools/issues/328) for ESM support was closed without action. |
| **Heavy `Buffer` usage** | ~30+ call sites: `Buffer.alloc()`, `Buffer.concat()`, `Buffer.from()`, `.writeUInt16LE()`, `.writeUInt32LE()`, `.toString('base64')`. Supabase Edge Functions run an older Deno without `Buffer` as a global. |
| **Synchronous Node.js crypto** | Uses `crypto.createHmac()` (sync). The Web-standard `crypto.subtle.sign()` is async — the entire `build()` API would need to become async. |
| **Synchronous zlib** | Uses `zlib.deflateSync()`. The Web-standard `CompressionStream` is also async. |

### What it would take to fix `agora-token` for Deno

The v007 builder (`AccessToken2.js`) has **zero npm dependencies** — the three deps (`crc-32`, `cuint`, `md5`) are only used by legacy v006 code. The required changes:

| Change | Effort |
|--------|--------|
| Convert CJS to ESM | Small |
| Replace ~30 `Buffer` calls with `Uint8Array` + `DataView` | Medium |
| Replace `crypto.createHmac` with `crypto.subtle.sign()` (async) | Small, but makes `build()` async |
| Replace `zlib.deflateSync` with `CompressionStream` (async) | Small, but also async |
| Drop the 3 unused npm deps from v007 path | Trivial |

The async change is the most impactful — it propagates through the entire API surface since all callers need to `await` token building.

### The inline implementation

The inline v007 builder is ~60 lines of Web-standard code:

| Node.js API | Web API Replacement |
|-------------|-------------------|
| `crypto.createHmac('sha256', ...)` | `crypto.subtle.importKey()` + `crypto.subtle.sign("HMAC", ...)` |
| `Buffer.alloc()`, `Buffer.concat()`, `Buffer.from()` | `Uint8Array` + manual `concat()` helper |
| `Buffer.writeUInt16LE()`, `Buffer.writeUInt32LE()` | `DataView.setUint16()`, `DataView.setUint32()` with little-endian flag |
| `zlib.deflateSync()` | `CompressionStream("deflate")` (Web Streams API) |
| `Buffer.toString('base64')` | `btoa()` with manual byte-to-char conversion |

This works natively in Deno, Supabase Edge Functions, Cloudflare Workers, or any Web-standard runtime — zero dependencies.

### Why v0 also uses inline tokens

The v0 variant (Next.js API routes on Node.js) could technically use the `agora-token` npm package. We use inline token generation anyway for:

- **Consistency** — same code pattern in both repos, easier to maintain
- **Zero token-related dependencies** — one less package for the AI platform to manage
- **Consistent AGENT.md** — no variant-specific dependency instructions

---

## The shadcn Connection

```
agent-samples:  "shadcn for generic UI, ui-kit for domain components"
                 ↓ extend the principle
vibe-coding:    "shadcn for everything — the AI platform is the developer"
```

Vibe-coding drops even the domain components because:
1. The ui-kit isn't on npm (so v0/Lovable can't install it) — the toolkit IS now on npm
2. The AI platform can't see into node_modules (so it can't debug them)
3. The AI platform can generate them (so they're not saving effort)

With the toolkit now on npm, #1 is partially resolved. But #2 and #3 still apply for v0/Lovable. Note that Claude Code has none of these constraints — it can install any package, read into node_modules, and understand the abstractions.

---

## Platform-Specific Design Choices

### v0 (Vercel)

| Decision | Reason |
|----------|--------|
| Next.js 16 App Router | v0's native framework — the platform understands it deeply |
| API routes for backend (`app/api/`) | Built into Next.js, no separate backend needed |
| `styles/globals.css` decoy file | Prevents v0 from overwriting `app/globals.css` (v0 tends to create `styles/globals.css` and override the real one) |
| Embedded SVG in AGENT.md | v0 regenerates SVGs from scratch instead of reading them from the repo — embedding exact path data in the instructions forces correct output |
| Dynamic imports for Agora SDKs | Prevents SSR crashes — `agora-rtc-sdk-ng` and `agora-rtm` access browser APIs (`window`, `navigator`) |

### Lovable

| Decision | Reason |
|----------|--------|
| Vite + React 18 | Lovable's native framework |
| Supabase Edge Functions (Deno) | Lovable auto-links a Supabase project — Edge Functions are the natural backend |
| `test-server.mjs` for local dev | Supabase Edge Functions run Deno and can't easily run locally; the test server mimics the edge function endpoints in Node.js |
| SVG in `AgoraLogo.tsx` | Unlike v0, Lovable faithfully copies component code from the repo — no need to embed SVG in AGENT.md |

---

## Side-by-Side Comparison

| Aspect | agent-samples | vibe-coding |
|--------|--------------|-------------|
| **Target** | Developers | AI coding platforms (v0, Lovable) |
| **Architecture** | Three packages (SDK / UI / App) | Single self-contained repo |
| **SDK wrapper** | `agora-agent-client-toolkit` (AgoraVoiceAI) | Raw `agora-rtc-sdk-ng` + `agora-rtm` in a custom hook |
| **UI: generic** | shadcn/Tailwind locally (same as vibe-coding) | shadcn/Tailwind locally |
| **UI: domain** | `@agora/agent-ui-kit` (AgentVisualizer, Conversation, etc.) | Built from scratch by the AI platform |
| **Token generation** | Inline Python v007 builder (stdlib only) | Inline JS v007 builder (Web APIs, Deno-compatible) |
| **Backend** | Python Flask (`simple-backend/`) | Next.js API routes (v0) / Supabase Edge Functions (Lovable) |
| **Runtime** | Node.js only | Node.js (v0) + Deno (Lovable) |
| **Installation** | `npm install --legacy-peer-deps` | Platform imports via URL prompt |
| **Package hosting** | GitHub refs (`github:AgoraIO-...#main`) | Only public npm packages |
| **Customization** | Fork and modify in IDE | Platform modifies via natural language |

---

## What agent-samples Gets From the Packages That We Reimplement

### From agent-toolkit

| Toolkit Feature | Vibe-Coding Equivalent |
|----------------|----------------------|
| `AgoraVoiceAI` (manages RTC + RTM + transcripts) | Direct `AgoraRTC.createClient()` + `AgoraRTM.RTM()` in custom hook |
| Built-in transcript processing (turn dedup, PTS sync) | Simplified transcript assembly in hook (pipe-delimited base64 protocol v2) |
| Dual transport (RTC stream messages + RTM) | Both transports handled inline |

### From agent-ui-kit

| UI Kit Component | Vibe-Coding Equivalent |
|-----------------|----------------------|
| `AgentVisualizer` (Lottie-based state animation) | Custom animated orb (`AgentOrb.tsx`) with CSS animations |
| `Conversation` / `Message` / `Response` | Custom `ChatPanel.tsx` |
| `MicButton` with `SimpleVisualizer` | Custom mic button with `WaveformBars.tsx` |
| `SettingsDialog` / `SessionPanel` | Custom `SettingsPanel.tsx` |
| `AgoraLogo` | Custom `AgoraLogo.tsx` (Lovable) / `public/agora.svg` (v0) |
| `AudioVisualizer` / `LiveWaveform` | Custom waveform in hook + component |

---

## What Would Change If All Packages Were on npm

The toolkit is now published on npm as `agora-agent-client-toolkit`. If `@agora/agent-ui-kit` were also published:

| Constraint | Status |
|-----------|--------|
| **Can't install toolkit on AI platforms** | **Removed** — `agora-agent-client-toolkit` is on npm |
| **Can't install ui-kit on AI platforms** | **Remains** — ui-kit is still GitHub-only |
| **AI can't see into node_modules** | **Remains** — platforms still can't read/modify package internals |
| **AI generates UI better from source** | **Remains** — platforms work better with code they own |
| **Deno token gen** | **Unrelated** — token gen is server-side, toolkit is client-side |

The toolkit being on npm makes it *possible* to use it on v0/Lovable, but the black-box and AI-modifiability arguments still favor inline code for those platforms. Claude Code is the exception — it can use the three-package model directly since it has full filesystem access and can read package internals.

---

## ConvoAI Engine Payload

Both repos send the same payload format to the Agora Conversational AI API:

```json
{
  "name": "<channel>",
  "properties": {
    "channel": "<channel>",
    "token": "<v007-token>",
    "agent_rtc_uid": "100",
    "agent_rtm_uid": "100-<channel>",
    "remote_rtc_uids": ["*"],
    "enable_string_uid": false,
    "idle_timeout": 120,
    "advanced_features": { "enable_rtm": true },
    "llm": {
      "url": "...", "api_key": "...",
      "system_messages": [{ "role": "system", "content": "..." }],
      "greeting_message": "...",
      "failure_message": "Sorry, something went wrong",
      "max_history": 32,
      "params": { "model": "..." },
      "style": "openai"
    },
    "asr": { "vendor": "ares", "language": "en-US" },
    "tts": { "vendor": "...", "params": { "key": "...", "voice_id": "..." } },
    "parameters": {
      "enable_dump": true,
      "transcript": { "enable": true, "protocol_version": "v2", "enable_words": false }
    },
    "turn_detection": {
      "config": { "end_of_speech": { "mode": "semantic" } }
    }
  }
}
```

Key payload choices:
- **`protocol_version: "v2"`** — Pipe-delimited base64 chunks (`messageId|partIdx|partSum|base64data`) for transcript delivery via RTC stream messages
- **`turn_detection.config.end_of_speech.mode: "semantic"`** — Semantic end-of-speech detection (replaces the deprecated `enable_aivad` flag). `enable_bhvs` was removed entirely. `enable_sal` (Selective Attention Locking) remains a separate option in `advanced_features` when needed.
- **`enable_dump: true`** — Enables server-side diagnostic dumps
- **`enable_rtm: true`** — Enables RTM text messaging between user and agent
- **`remote_rtc_uids: ["*"]`** — Wildcard subscribes to all users. Agent-samples uses `["<user_uid>"]` only when an avatar vendor is configured (avatar requires explicit UID targeting).
- **`agent_rtm_uid: "100-<channel>"`** — RTM UID format for agent. Clients target RTC UID `"100"` for messages, not this value.

---

## Future Improvements

**Consolidate with AI_SAMPLES_DESIGN.md** — This document and `AI_SAMPLES_DESIGN.md` both describe the three-package model and shadcn philosophy from different perspectives. If the vibe-coding repos stabilize, these could merge into a single design doc with an "AI Platform Constraints" section.

**Claude Code as primary AI workflow** — With Claude Code, developers get the benefits of AI-assisted coding (natural language modifications, automated debugging) without the platform constraints that drove the vibe-coding design. Agent-samples + Claude Code may reduce the need for separate vibe-coding repos over time.

**Publish ui-kit to npm** — The toolkit is now on npm as `agora-agent-client-toolkit`. If the ui-kit is also published, constraint #1 fully disappears for both packages. The vibe-coding repos would still be justified by constraints #2 and #3, but the gap narrows further.

**Shared token builder** — Both repos inline v007 token generation independently (Python stdlib vs Web APIs). A shared, Web-standard token module published to npm and Deno registries would eliminate this duplication while remaining platform-agnostic.

---

**Last Updated**: 2026-03-05
