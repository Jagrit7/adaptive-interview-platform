# Complete Voice AI Client

Complete HTML/Javascript client that calls a backend to start an Agora AI voice
agent and get RTC credentials, then joins the channel to talk with the agent.

> **📘 For AI Coding Assistants:** See [../AGENT.md](../AGENT.md) for comprehensive implementation guidance.

## How It Works

1. User enters channel name and backend URL (optional)
2. Client calls backend `/start-agent` endpoint
3. Backend starts AI agent and returns:
   - Agora App ID
   - RTC token
   - Channel name
   - User ID
4. Client automatically joins the channel with those credentials
5. Agent is already waiting in the channel

## Usage

Open `index.html` in a browser. Configure via form or URL parameters:

**URL Parameters:**

```
index.html?channel=test&backend=http://localhost:8082&title=My%20Agent
```

**Parameters:**

- `channel` (required) - Channel name
- `backend` (optional) - Backend URL (defaults to http://localhost:8082)
- `title` (optional) - Session title (defaults to "Voice AI Agent")

## Local Testing

Run a local web server in this directory:

**Python:**

```bash
python3 -m http.server 8003
```

**Node.js:**

```bash
npx http-server -p 8003
```

Then open http://localhost:8003 in your browser.

## Backend Required

This client requires a running backend. See
[../simple-backend/](../simple-backend/) for setup instructions.

**Quick backend start:**

```bash
cd ../simple-backend
PORT=8082 python3 local_server.py
```

Backend should be running on http://localhost:8082

## Complete Flow Example

1. **Start backend:**

   ```bash
   cd ../simple-backend
   PORT=8082 python3 local_server.py
   # Running on http://localhost:8082
   ```

2. **Open client:**

   ```
   http://localhost:8003/index.html?channel=test
   ```

3. **Client actions:**
   - Calls `http://localhost:8082/start-agent?channel=test`
   - Receives credentials from backend
   - Joins channel with those credentials
   - Agent is already in channel

4. **Talk with the AI agent!**

## Features

- Automatic backend integration
- Real-time audio visualization
- Microphone selection
- Mute/unmute controls
- No manual token/appid entry needed

## Differences from Simple Voice Client

| Feature             | Simple Voice Client         | Complete Voice Client |
| ------------------- | --------------------------- | --------------------- |
| Manual credentials  | ✅ Enter appid, token, uid  | ❌ Not needed         |
| Backend integration | ❌ No backend needed        | ✅ Calls backend      |
| Agent management    | ❌ Manual                   | ✅ Automatic          |
| Use case            | Testing with existing agent | Production-ready flow |
