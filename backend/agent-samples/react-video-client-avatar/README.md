# <img src="../assets/agora-logo.svg" alt="Agora" width="24" height="24" style="vertical-align: middle; margin-right: 8px;" /> React Video Avatar AI Client

React/Next.js implementation demonstrating video avatar integration with the
Agora Conversational AI SDK and UI Kit.

> **📘 For AI Coding Assistants:** See [../AGENT.md](../AGENT.md) for comprehensive implementation guidance and API reference.
>
> **⚡ Quick Start:** Follow the [Video Avatar Quick Start](../AGENT.md#video-avatar-quick-start) guide in AGENT.md for step-by-step setup instructions.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Layouts](#layouts)
  - [Desktop Layout](#desktop-layout-768px)
  - [Mobile Layout](#mobile-layout-768px)
- [Project Structure](#project-structure)
- [Key Implementation Details](#key-implementation-details)
  - [Video Components](#video-components)
  - [Responsive Layout Strategy](#responsive-layout-strategy)
  - [Voice Interaction](#voice-interaction)
- [Building for Production](#building-for-production)
- [Tech Stack](#tech-stack)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Video Avatar Display** - Real-time avatar video streaming
- **Local Camera Preview** - User's camera with mirror effect
- **Responsive Layouts** - Adaptive desktop grid and mobile tab layouts
- **Voice Interaction** - Full voice AI conversation with transcription
- **MediaStream Rendering** - Multi-instance video display for responsive
  layouts
- **TypeScript** - Full type safety with Agora SDK and UIKit types
- **React 19 & Next.js 16** - Latest React features and patterns

## Architecture

This sample application uses the Agora Conversational AI SDK (from npm) and UI Kit packages:

**Dependencies:**

- `agora-agent-client-toolkit` - Core client toolkit from [agent-client-toolkit-ts](https://github.com/AgoraIO-Conversational-AI/agent-client-toolkit-ts) — RTC/RTM connection management, transcript handling, and React hooks
- `@agora/agent-ui-kit` - UI components from [agent-ui-kit](https://github.com/AgoraIO-Conversational-AI/agent-ui-kit)

**Key Components:**

1. **LocalVideoPreview** - Displays local camera with mirror effect
2. **AvatarVideoDisplay** - Shows remote avatar video stream
3. **VideoGrid** - Desktop 2x2 grid layout (40/60 split)
4. **MobileTabs** - Mobile tab switcher for Video and Chat views
5. **AgoraVoiceAI** - Main toolkit class for managing voice AI connections (from agent-client-toolkit)

## Prerequisites

- Node.js >= 20.9.0 (required by Next.js 16)
- Python backend running on port 8082 (see `../simple-backend/`)

## Configuration

This client runs on port **8084** and connects to the backend on port **8082**.

## Setup and Run

**Install dependencies:**

```bash
npm install --legacy-peer-deps
```

The `--legacy-peer-deps` flag is required due to agora-rtm peer dependency requirements.

**Run development server:**

```bash
npm run dev
```

**Open browser:**

```
http://localhost:8084
```

## Usage

**Backend Configuration:**

This client sends `?profile=VIDEO` to use the VIDEO profile configuration. The backend must be configured with video-specific settings.

**Required Backend Setup:**

Configure the backend with VIDEO profile settings (VIDEO\_\* prefixed variables):

- `VIDEO_APP_ID`, `VIDEO_APP_CERTIFICATE`, `VIDEO_AGENT_AUTH_HEADER` (Agora credentials)
- `VIDEO_LLM_API_KEY` (LLM for video)
- `VIDEO_TTS_VENDOR`, `VIDEO_TTS_KEY`, `VIDEO_TTS_VOICE_ID` (TTS for video)
- `VIDEO_AVATAR_VENDOR` (heygen, anam, akool, or generic)
- `VIDEO_AVATAR_API_KEY`, `VIDEO_AVATAR_ID` (avatar provider credentials)
- `VIDEO_AVATAR_API_BASE_URL` (required when `VIDEO_AVATAR_VENDOR=generic`)

See [../simple-backend/.env.example](../simple-backend/.env.example) for a complete template with all VIDEO profile variables.

**Profile Override:**

You can override the default profile using the "Server Profile" field in the UI. Profile names are case-insensitive (VIDEO, video, or Video all work).

Shared links can also override `voice_id`, `avatar_id`, and `avatar_api_base_url` via the page URL. Those values are forwarded to `simple-backend` when the session starts.

**Recommended Shared-Link Profiles:**

For local avatar switching, define three complete backend profiles and link to them directly:

- `anam` - Anam avatar profile
- `generic_tru` - Trulience generic avatar profile
- `generic_ls` - LemonSlice generic avatar profile

Example local URLs:

```text
http://localhost:8084/?autoconnect=true&profile=anam
http://localhost:8084/?autoconnect=true&profile=generic_tru
http://localhost:8084/?autoconnect=true&profile=generic_ls
```

Example with explicit avatar and voice overrides:

```text
http://localhost:8084/?autoconnect=true&profile=anam&avatar_id=<anam-avatar-id>&voice_id=<elevenlabs-voice-id>
http://localhost:8084/?autoconnect=true&profile=generic_tru&avatar_id=<trulience-avatar-id>&voice_id=<elevenlabs-voice-id>
http://localhost:8084/?autoconnect=true&profile=generic_ls&avatar_id=<lemonslice-avatar-id>&voice_id=<elevenlabs-voice-id>
```

**Start Services:**

1. **Start the Backend** (if not already running):

   ```bash
   cd ../simple-backend
   PORT=8082 python3 local_server.py
   ```

2. **Start the React Video Client**:

   ```bash
   npm run dev
   ```

3. **Connect to Agent**:
   - Backend URL should be `http://localhost:8082` (default)
   - Enable "Enable Local Video" to show your camera
   - Enable "Enable Avatar" to show avatar video
   - Click "Start Conversation"
   - Client automatically calls `/start-agent?profile=VIDEO` to use
     video-specific backend configuration

4. **Interact with Agent**:
   - Speak into your microphone
   - See local video in bottom-left (desktop) or Video tab (mobile)
   - See avatar video in right column (desktop) or Video/Chat tabs (mobile)
   - View transcriptions in Chat section
   - Toggle camera and mute with control buttons
   - End call with "End Call" button

## Layouts

### Desktop Layout (≥768px)

2x2 Grid layout with 40/60 column split:

```
┌─────────────┬─────────────┐
│ Chat        │ Avatar      │
│ (40%)       │ Video       │
│             │ (60%)       │
├─────────────┤             │
│ Local Video │ + Controls  │
│ (40%)       │             │
└─────────────┴─────────────┘
```

### Mobile Layout (<768px)

Tab-based layout with two tabs:

**Video Tab:**

- Avatar video (50%)
- Local video (50%)

**Chat Tab:**

- Avatar video (35%)
- Conversation (65%)

Fixed bottom controls for microphone, camera, and end call.

## Project Structure

```
react-video-client-avatar/
├── app/
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Main page
│   └── globals.css              # Tailwind CSS with workspace scanning
├── components/
│   └── VideoAvatarClient.tsx    # Main video client component
├── hooks/
│   ├── use-audio-devices.ts
│   ├── use-is-mobile.ts
│   └── useAgoraVideoClient.ts   # Custom hook for Agora integration
├── lib/
│   └── theme/                   # Theme utilities
├── next.config.ts               # Transpile workspace packages
├── package.json                 # Dependencies
└── README.md                    # This file
```

## Key Implementation Details

### Video Components

Uses MediaStream mode for responsive layouts:

```typescript
import { LocalVideoPreview, AvatarVideoDisplay } from '@agora/agent-ui-kit'

// Local camera
<LocalVideoPreview
  videoTrack={localVideoTrack}
  useMediaStream={true}  // Enables multi-instance rendering
/>

// Avatar video (remote video track from agent-client-toolkit)
<AvatarVideoDisplay
  videoTrack={avatarVideoTrack}
  state={avatarVideoTrack ? "connected" : "disconnected"}
  useMediaStream={true}  // Enables multi-instance rendering
/>
```

**MediaStream Mode** allows the same video track to be displayed in multiple
locations simultaneously (desktop and mobile layouts).

### Responsive Layout Strategy

Uses CSS-based conditional visibility instead of conditional rendering:

```typescript
{/* Desktop - Hidden on mobile */}
<VideoGrid className="hidden md:grid flex-1" ... />

{/* Mobile - Hidden on desktop */}
<div className="flex md:hidden flex-1 flex-col" ... >
  <MobileTabs ... />
</div>
```

This approach ensures video tracks don't need to be moved in the DOM when
switching viewports.

### Voice Interaction

Full voice AI capabilities using the `useAgoraVideoClient` hook:

```typescript
const {
  isConnected,
  isMuted,
  micState,
  messageList,
  currentInProgressMessage,
  isAgentSpeaking,
  localAudioTrack,
  remoteVideoTrack,
  joinChannel,
  leaveChannel,
  toggleMute,
  sendMessage,
  rtcClientRef,
  rtmClientRef,
} = useAgoraVideoClient();
```

## Building for Production

```bash
npm run build
npm start
```

The build creates an optimized production bundle with:

- Transpiled workspace packages
- Server-side rendering disabled for browser-only components
- TypeScript type checking
- Optimized static pages

## Tech Stack

- **Framework**: Next.js 16 with App Router and Turbopack
- **Language**: TypeScript 5
- **Runtime**: React 19
- **Styling**: Tailwind CSS v4
- **UI Components**: Agora AI UIKit
- **RTC SDK**: agora-rtc-sdk-ng v4.24+
- **Icons**: lucide-react
- **State Management**: React hooks

## Troubleshooting

**Local video not showing:**

- Check camera permissions in browser
- Ensure "Enable Local Video" is checked before connecting
- Check browser console for Agora SDK errors

**Avatar video not appearing:**

- Verify backend has avatar provider credentials configured (see
  `../simple-backend/README.md`)
- Check "Enable Avatar" is checked before connecting
- Verify backend logs for agent creation success

**Backend BAD REQUEST errors:**

- See [AI Assistant Troubleshooting](../AGENT.md#ai-assistant-troubleshooting) in AGENT.md for comprehensive troubleshooting guidance
- Common cause: Missing VIDEO\_\* prefixed environment variables
- Remember: Video profile requires ALL credentials with VIDEO\_ prefix (no fallback to base variables)

**Layout issues:**

- Refresh page if switching between desktop/mobile viewports
- Check browser width (768px is the breakpoint)

## Contributing

When adding new features:

1. Use existing UI Kit components when possible
2. Update TypeScript types appropriately
3. Test both desktop and mobile layouts
4. Test build with `npm run build` before committing
5. Update this README if adding new major features

## License

MIT
