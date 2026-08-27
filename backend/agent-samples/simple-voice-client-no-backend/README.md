# Simple Voice AI Client

Simple HTML/Javascript client for connecting to an Agora RTC Channel with 2-way
audio. Agora AI voice agents can come and go. Useful for testing agents without
needing to refresh or reconnect client.

> **📘 For AI Coding Assistants:** See [../AGENT.md](../AGENT.md) for comprehensive implementation guidance.

## Usage

Open `index.html` in a browser. Configure via form or URL parameters:

**URL Parameters:**

```
index.html?appid=YOUR_APP_ID&channel=YOUR_CHANNEL&token=YOUR_TOKEN&uid=123&title=My%20Agent
```

**Parameters:**

- `appid` (required) - Agora App ID
- `channel` (required) - Channel name
- `token` (optional) - Authentication token (leave blank if your project doesn't
  have App Certificate enabled)
- `uid` (optional) - User ID (auto-generated if not provided)
- `title` (optional) - Session title (defaults to "Voice AI Agent")

## Features

- Real-time audio visualization
- Microphone selection
- Mute/unmute controls
- No build step required

## Local Testing

Run a local web server in this directory:

**Python:**

```bash
python3 -m http.server 8000
```

**Node.js:**

```bash
npx http-server -p 8000
```

Then open http://localhost:8000 in your browser.
