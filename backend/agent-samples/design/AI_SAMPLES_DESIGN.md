# Agora Conversational AI — Design Rationale

**Location**: `agent-samples/design/AI_SAMPLES_DESIGN.md`

This document explains the architecture decisions behind the three core front-end packages: `agent-samples`, `agent-toolkit`, and `agent-ui-kit`.

---

## The Three-Package Model

```
agent-client-toolkit (agora-agent-client-toolkit) — SDK layer
agent-ui-kit  (@agora/agent-ui-kit)         — Component layer
agent-samples                               — Application layer
```

Each layer has a single responsibility and can be used independently.

### Why Three Packages, Not One?

A monolithic sample app forces developers to fork and modify the entire codebase. The three-package split gives developers choice:

1. **Use everything** — clone `agent-samples`, get a working app in minutes
2. **Use SDK + own UI** — install `agora-agent-client-toolkit`, build custom components
3. **Use components + own logic** — install `@agora/agent-ui-kit`, wire up your own SDK calls
4. **Use both packages** — install both, combine SDK helpers with pre-built UI

Developers adopt what they need without carrying what they don't.

---

## agent-client-toolkit (`agora-agent-client-toolkit`)

### Purpose

Eliminate the complexity of integrating Agora RTC and RTM for voice AI. Without this package, a developer must: initialize an RTC client, create and publish audio tracks with echo cancellation, join a channel, separately initialize RTM, login, subscribe, parse incoming stream messages (which arrive as chunked Base64-encoded binary), reassemble them, deduplicate by turn ID, synchronize text rendering with audio PTS timestamps, and handle interrupts. The toolkit does all of this.

### What It Provides

| Module | Responsibility |
|--------|---------------|
| **AgoraVoiceAI** | Main class — initializes RTC + RTM via `init()` factory, wires up transcript processing, exposes `sendMessage()` and event callbacks |
| **AgoraVoiceAIEvents** | Event type definitions for all voice AI events (transcript updates, connection state, agent speaking, etc.) |
| **TranscriptHelperMode** | Transcript rendering modes — controls how transcript text is assembled and displayed |
| **TurnStatus** | Turn state enum — `IN_PROGRESS`, `END`, `INTERRUPTED` for tracking conversation turns |

### Design Decisions

**Factory pattern** for AgoraVoiceAI. A voice AI session is created via `AgoraVoiceAI.init()` which returns a configured instance managing both RTC and RTM connections. Calling `disconnect()` cleans up all resources.

**Dual transport** — transcripts arrive via both RTC stream messages and RTM. This provides redundancy; if one transport has packet loss, the other fills in.

**PTS synchronization** — the toolkit's transcript processor aligns word display timing with audio playback timestamps. Without this, text appears before or after the agent speaks it. The `word` render mode uses `start_ms` from each word to display it exactly when the audio plays.

**Framework-agnostic core** — the SDK is pure TypeScript with no React dependency. This means Vue, Svelte, or vanilla JS apps can use the core SDK directly.

**Zero runtime dependencies** — only peer dependencies on `agora-rtc-sdk-ng` and `agora-rtm`. No bundled third-party code.

### Conventions

- AgoraVoiceAI instance created via `init()`, cleaned up via `disconnect()`
- Events use callback-based API (`on()` / `off()`)
- Agent UID is configurable (default `"0"`)
- Transcript messages use `turn_id` for deduplication and `turn_status` (IN_PROGRESS / END / INTERRUPTED) for state

---

## agent-ui-kit (`@agora/agent-ui-kit`)

### Purpose

Provide domain-specific React components for voice AI interfaces — the parts that are unique to conversational AI and not covered by general-purpose UI libraries. The package focuses on agent visualization, conversation transcript rendering, session debugging, and video avatar display.

### What the Samples Actually Use

The sample apps use ui-kit for **domain-specific components** only. Generic UI (buttons, inputs, layout, icons) is handled locally with Tailwind CSS and shadcn conventions.

| Category | Components used by samples |
|----------|---------------------------|
| **Voice** | `AgentVisualizer` (Lottie-based agent state animation) |
| **Chat** | `Conversation`, `ConversationContent`, `Message`, `MessageContent`, `Response` |
| **Video** | `AvatarVideoDisplay`, `LocalVideoPreview`, `VideoGrid` |
| **Settings** | `SettingsDialog`, `SessionPanel` (shows agent ID + redacted payload) |
| **Layout** | `MobileTabs`, `AgoraLogo` |
| **Hooks** | `useThymia` (voice biomarker data via RTM) |
| **Types** | `IconButton`, `MicButtonState`, `AgentVisualizerState`, `RTMEventSource` |

### What the Samples Do NOT Use

The following ui-kit exports are available but **not used by the sample apps**, which prefer local Tailwind/shadcn equivalents:

| Category | Unused components | Replaced by |
|----------|-------------------|-------------|
| **Primitives** | `Button`, `Card`, `Chip`, `ValuePicker`, `DropdownMenu`, `Command`, `Popover` | Raw `<button>` / `<div>` with Tailwind classes |
| **Voice controls** | `MicButton`, `MicButtonWithVisualizer`, `AudioVisualizer`, `LiveWaveform`, `SimpleVisualizer`, `MicSelector` | Local `lucide-react` icons + `useAudioVisualization` hook |
| **Device selection** | `CameraSelector`, `MicSelector` | Not implemented in samples |
| **Settings** | `AgentSettings` | Inline settings in `SettingsDialog` children |
| **Utilities** | `cn()`, `renderMarkdownToHtml()`, `decodeStreamMessage()`, `MessageEngine` | Local copies in `lib/utils.ts` |
| **Hooks** | `useRTMSubscription`, `useAudioDevices`, `useIsMobile` | Not used |

These components remain in the package for third-party consumers who want a more batteries-included approach.

### What It Provides (Full Inventory)

| Category | Components |
|----------|-----------|
| **Voice** | `AgentVisualizer`, `MicButton`, `AudioVisualizer`, `LiveWaveform`, `MicSelector`, `MicButtonWithVisualizer`, `SimpleVisualizer` |
| **Chat** | `Conversation`, `ConversationContent`, `Message`, `MessageContent`, `Response`, `ConvoTextStream` |
| **Video** | `Avatar`, `AvatarVideoDisplay`, `LocalVideoPreview`, `CameraSelector`, `VideoGrid`, `VideoGridWithControls` |
| **Settings** | `SettingsDialog`, `SessionPanel`, `AgentSettings` |
| **Layout** | `MobileTabs`, `AgoraLogo` |
| **Primitives** | `Button`, `IconButton`, `Card`, `Chip`, `ValuePicker`, `DropdownMenu`, `Command`, `Popover` |
| **Hooks** | `useRTMSubscription`, `useThymia`, `useAudioDevices`, `useIsMobile` |
| **Utilities** | `MessageEngine`, `renderMarkdownToHtml()`, `cn()`, `decodeStreamMessage()` |

### Design Decisions

**Domain components from ui-kit, generic UI from shadcn** — the samples use a shadcn/v0-style CSS variable system (`globals.css` with oklch color tokens, `--background`, `--primary`, `--destructive`, etc.) for theming and Tailwind utilities for all generic layout and controls. The ui-kit is reserved for components that encode voice AI domain logic: transcript rendering with turn semantics, agent state visualization, session debugging panels, and avatar video display. This avoids coupling sample app styling to the ui-kit's primitives while still benefiting from its specialized components.

**Radix UI primitives** — `SettingsDialog` and other overlay components use Radix internally for accessibility (keyboard navigation, screen readers, focus management) without imposing visual styling on consumers.

**Headless where possible** — components like `Conversation` and `Message` accept children and className overrides. The layout is opinionated but the content is flexible.

**MessageEngine** — a standalone transcript processor available in ui-kit for consumers who don't use the toolkit SDK. The sample apps use the toolkit's built-in transcript processing instead, so `MessageEngine` is unused in samples but available for third-party integrations.

**Lottie animations** — `AgentVisualizer` uses dotLottie files for the agent state visualization (listening, talking, not-joined). Files are loaded from a configurable `lottieBasePath`, not bundled, keeping the package small.

**Duplicated utilities** — `cn()`, `renderMarkdownToHtml()`, and `decodeStreamMessage()` exist in both ui-kit and the sample apps' local `lib/utils.ts`. The samples maintain local copies to avoid tight coupling to ui-kit for trivial functions. This is intentional — samples should be easy to fork without pulling in the entire ui-kit dependency chain.

### Conventions

- All components accept standard React props (`className`, `style`, `children` where applicable)
- Sizing uses `sm` / `md` / `lg` variants (e.g., `AgentVisualizer size="sm"`)
- Message components use `from="user" | "assistant"` for styling direction
- Color tokens use CSS variables (`--background`, `--foreground`, `--primary`, etc.) for theme support
- Samples define their own color palette in `globals.css` using shadcn conventions (oklch values, light/dark variants)

---

## agent-samples

### Purpose

Working reference implementations that demonstrate how to combine the toolkit and ui-kit into complete applications. Developers clone this repo to get started, then customize or replace components as needed.

### What It Provides

| Sample | Description |
|--------|-------------|
| `react-voice-client` | Full voice AI client — ElevenLabs/Rime TTS, GPT-4o LLM, Ares/Deepgram STT, conversation transcript, settings panel |
| `react-video-client-avatar` | Video avatar client — same as voice plus HeyGen/Anam avatar rendering |
| `simple-voice-client-no-backend` | Minimal voice client with no backend dependency (tokens hardcoded) |
| `simple-voice-client-with-backend` | Minimal voice client that calls the simple-backend for tokens |
| `simple-backend` | Python Flask backend — profile-based config, v007 token generation, Agora ConvoAI API integration, curl dump debugging |

### Design Decisions

**shadcn/Tailwind for styling, ui-kit for domain components** — the sample apps own their own theming and generic UI. `globals.css` defines a full shadcn-style CSS variable system (oklch colors, light/dark variants, `--background`, `--primary`, `--destructive`, etc.). Buttons, inputs, layout, and icons use raw Tailwind classes and `lucide-react` — not ui-kit primitives. The ui-kit is used only for voice AI domain components (`AgentVisualizer`, `Conversation`/`Message`, `SettingsDialog`/`SessionPanel`, `AvatarVideoDisplay`/`VideoGrid`). This means developers can restyle the entire app by editing `globals.css` and Tailwind classes without touching ui-kit internals.

**Local utilities** — the samples maintain their own `lib/utils.ts` with `cn()` (Tailwind class merge), `renderMarkdownToHtml()`, and `decodeStreamMessage()`. These are intentionally duplicated from ui-kit to keep the samples self-contained and easy to fork.

**Profile-based configuration** — the backend uses `<PROFILE>_<VARIABLE>` env vars (e.g., `VOICE_TTS_VENDOR`, `VIDEO_AVATAR_VENDOR`). This allows a single backend instance to serve multiple client configurations without code changes. Profiles are selected via query parameter (`?profile=VOICE_SAL`).

**3-phase safe join** — the voice and video clients use a three-step connection flow:
1. Request tokens with `connect=false` (no agent started)
2. Client joins RTC channel (RTM ready to receive)
3. Start agent (greeting arrives over RTM immediately)

This ensures the client never misses the agent's greeting message.

**Inline v007 token generation** — the backend generates Agora v007 tokens in `core/tokens.py` (~80 lines) using only Python stdlib (`hmac`, `hashlib`, `zlib`, `base64`, `struct`). Agora provides v007 reference code in [AgoraIO/Tools](https://github.com/AgoraIO/Tools/tree/master/DynamicKey/AgoraDynamicKey/python/src) on GitHub, but it is not published to PyPI as a standalone package — it lives in a monorepo with a custom `Packer` dependency. The only pip-installable package (`agora-token-builder`) is v006 only. Inlining the builder keeps `requirements.txt` at zero external dependencies (Python stdlib only), which simplifies AWS Lambda deployment and eliminates version management for a token library.

**Progressive complexity** — the four sample apps increase in complexity: `simple-voice-client-no-backend` (simplest, ~50 lines of logic) → `simple-voice-client-with-backend` (adds token flow) → `react-voice-client` (full UI) → `react-video-client-avatar` (adds avatar). Developers start simple and scale up.

---

## Package Relationship

```
┌───────────────────────────────────────────────────────┐
│                    agent-samples                       │
│   (react-voice-client, react-video-client, etc.)      │
│                                                        │
│   Local styling: shadcn CSS vars + Tailwind + lucide   │
│   Local utils:   cn(), renderMarkdownToHtml()          │
│                                                        │
│   From toolkit:  AgoraVoiceAI                          │
│   From ui-kit:   AgentVisualizer, Conversation/Message,│
│                  SettingsDialog, SessionPanel,          │
│                  AvatarVideoDisplay, VideoGrid,         │
│                  MobileTabs, IconButton, useThymia      │
└──────────┬──────────────────┬─────────────────────────┘
           │                  │
           ▼                  ▼
┌──────────────────┐ ┌─────────────────────────┐
│ agent-client-    │ │      agent-ui-kit       │
│ toolkit          │ │                         │
│                  │ │  Used by samples:       │
│  AgoraVoiceAI    │ │    AgentVisualizer      │
│  Events/Types    │ │    Conversation/Message  │
│                  │ │    SettingsDialog        │
│  Peer deps:      │ │    SessionPanel          │
│  agora-rtc-sdk   │ │    AvatarVideoDisplay    │
│  agora-rtm       │ │    VideoGrid, MobileTabs │
│                  │ │                         │
│                  │ │  Available but unused:   │
│                  │ │    Button, Card, Popover │
│                  │ │    MicButton, MicSelector│
│                  │ │    MessageEngine, cn()   │
│                  │ │                         │
│                  │ │  Peer deps:              │
│                  │ │  react, radix-ui         │
│                  │ │  tailwind-merge          │
└──────────────────┘ └─────────────────────────┘
        ▲                     ▲
        │                     │
   No dependency between them — independent packages
```

The toolkit and ui-kit do not depend on each other. A developer can use either one alone. The samples use the toolkit for all SDK/connection logic and ui-kit for domain-specific components only — generic UI primitives and utilities are handled locally with shadcn conventions.

---

## Installation

```bash
# Full stack (what agent-samples uses)
npm install agora-agent-client-toolkit @agora/agent-ui-kit agora-rtc-sdk-ng agora-rtm

# SDK only (custom UI)
npm install agora-agent-client-toolkit agora-rtc-sdk-ng agora-rtm

# Components only (custom SDK logic)
npm install @agora/agent-ui-kit
```

The toolkit is published on npm as `agora-agent-client-toolkit`. The ui-kit is installed from GitHub:

```json
{
  "agora-agent-client-toolkit": "^1.1.0",
  "@agora/agent-ui-kit": "github:AgoraIO-Conversational-AI/agent-ui-kit#main"
}
```

---

## Related Documents

- [`VIBE_CODING_DESIGN.md`](./VIBE_CODING_DESIGN.md) — Why the vibe-coding repos flatten this three-package model for AI coding platforms (v0, Lovable)
- [`AI_SAMPLES_UIKIT_TOOLKIT_DEV.md`](./AI_SAMPLES_UIKIT_TOOLKIT_DEV.md) — Cross-repository development workflow, git hooks, and operational guide

---

## Future Improvements

**Publish ui-kit to npm** — The toolkit is now published on npm as `agora-agent-client-toolkit`. Moving `@agora/agent-ui-kit` to the npm registry as well would complete the migration, enable AI coding platforms to install it, and add proper semantic versioning.

**Reduce unused ui-kit exports** — The samples don't use ui-kit's `Button`, `Card`, `Popover`, `MicButton`, `MicSelector`, `CameraSelector`, `MessageEngine`, or `cn()`. These remain for third-party consumers, but the package could be split or tree-shaken to reduce the surface area.

**Consolidate duplicated utilities** — `cn()`, `renderMarkdownToHtml()`, and `decodeStreamMessage()` are intentionally duplicated in samples and ui-kit. With the toolkit now on npm, samples could potentially import these from ui-kit instead.

**Consolidate design docs** — This document and [`VIBE_CODING_DESIGN.md`](./VIBE_CODING_DESIGN.md) both describe the three-package model from different angles. If the vibe-coding repos stabilize, these could merge into a single design doc.

---

**Last Updated**: 2026-03-05
