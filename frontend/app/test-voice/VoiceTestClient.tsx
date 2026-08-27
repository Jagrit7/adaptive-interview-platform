"use client";

import { useState } from "react";
import { useAgoraVoiceClient } from "@/hooks/useAgoraVoiceClient";

const APP_ID = "02bcecea17334c6dad96219c276fbd38";
const BACKEND_URL = "http://localhost:8000";

export default function VoiceTestClient() {
  const [channel, setChannel] = useState("sde-test-1");
  const [uid, setUid] = useState(1002);
  const [agentId, setAgentId] = useState("tech-dsa");
  const [status, setStatus] = useState("idle");

  const { isConnected, isAgentSpeaking, messageList, joinChannel, leaveChannel } =
    useAgoraVoiceClient();

  const handleStart = async () => {
    try {
      setStatus("fetching token...");
      const tokenRes = await fetch(
        `${BACKEND_URL}/token?channel=${channel}&uid=${uid}`
      );
      const { token } = await tokenRes.json();

      setStatus("starting agent...");
      await fetch(
        `${BACKEND_URL}/agents/start?agent_id=${agentId}&channel=${channel}&remote_uid=${uid}`,
        { method: "POST" }
      );

      setStatus("joining channel...");
      await joinChannel({
        appId: APP_ID,
        channel,
        token,
        uid,
      });

      setStatus("connected");
    } catch (err) {
      console.error(err);
      setStatus("error - check console");
    }
  };

  const handleStop = async () => {
    await leaveChannel();
    setStatus("idle");
  };

  return (
    <div style={{ padding: 40, color: "#EDEDEF", background: "#0A0A0C", minHeight: "100vh" }}>
      <h1>Voice Agent Test</h1>

      <div style={{ marginBottom: 16 }}>
        <label>Agent ID: </label>
        <input value={agentId} onChange={(e) => setAgentId(e.target.value)} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label>Channel: </label>
        <input value={channel} onChange={(e) => setChannel(e.target.value)} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label>UID: </label>
        <input
          type="number"
          value={uid}
          onChange={(e) => setUid(Number(e.target.value))}
        />
      </div>

      <button onClick={handleStart} disabled={isConnected}>
        Start Interview
      </button>
      <button onClick={handleStop} disabled={!isConnected} style={{ marginLeft: 8 }}>
        Stop
      </button>

      <p>Status: {status}</p>
      <p>Connected: {isConnected ? "yes" : "no"}</p>
      <p>Agent speaking: {isAgentSpeaking ? "yes" : "no"}</p>

      <h3>Transcript</h3>
      <ul>
        {messageList.map((m) => (
          <li key={m.turn_id}>
            <strong>{m.uid}:</strong> {m.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
