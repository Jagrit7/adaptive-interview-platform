"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Mic,
  MicOff,
  Settings,
  Phone,
  PhoneOff,
  SendHorizontal,
} from "lucide-react";
import { useAgoraVoiceClient } from "@/hooks/useAgoraVoiceClient";
import { useAudioVisualization } from "@/hooks/useAudioVisualization";
import { IconButton } from "@agora/agent-ui-kit";
import { AgentVisualizer, AgentVisualizerState } from "@agora/agent-ui-kit";
import { Conversation, ConversationContent } from "@agora/agent-ui-kit";
import { Message, MessageContent } from "@agora/agent-ui-kit";
import { Response } from "@agora/agent-ui-kit";
import { AgoraLogo } from "@agora/agent-ui-kit";
import { SettingsDialog } from "@agora/agent-ui-kit";
import { SessionInfoPanel } from "./SessionInfoPanel";
import { cn } from "@/lib/utils";
import { MobileTabs } from "@agora/agent-ui-kit";
import { ThymiaPanel, useThymia } from "@agora/agent-ui-kit/thymia";
import type { RTMEventSource } from "@agora/agent-ui-kit/thymia";
import { ThemeToggle } from "./ThemeToggle";

function getBackendOverride(params: URLSearchParams): string | null {
  return params.get("backend") || params.get("backend_url");
}

function resolveDefaultBackendUrl() {
  if (typeof window !== "undefined") {
    const override = getBackendOverride(
      new URLSearchParams(window.location.search),
    );
    if (override) {
      return override;
    }
    if (process.env.NEXT_PUBLIC_BACKEND_URL !== undefined) {
      return process.env.NEXT_PUBLIC_BACKEND_URL;
    }
    const { hostname, protocol } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:8082`;
    }
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8082";
}

const DEFAULT_BACKEND_URL = resolveDefaultBackendUrl();
const DEFAULT_PROFILE = process.env.NEXT_PUBLIC_DEFAULT_PROFILE || "VOICE";
const THYMIA_ENABLED = process.env.NEXT_PUBLIC_ENABLE_THYMIA === "true";

const SENSITIVE_KEYS = [
  "api_key",
  "key",
  "token",
  "adc_credentials_string",
  "subscriber_token",
  "rtm_token",
  "ticket",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractResolvedPromptAndGreeting(payload: any): { prompt: string; greeting: string } {
  const props = payload?.properties;
  if (!props) return { prompt: "", greeting: "" };
  if (props.mllm) {
    return {
      prompt: props.mllm.messages?.[0]?.content || "",
      greeting: props.mllm.greeting_message || "",
    };
  }
  if (props.llm) {
    return {
      prompt: props.llm.system_messages?.[0]?.content || "",
      greeting: props.llm.greeting_message || "",
    };
  }
  return { prompt: "", greeting: "" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function redactSensitiveFields(obj: any): any {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitiveFields);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.includes(k) && typeof v === "string" && v.length > 6) {
      out[k] = v.slice(0, 6) + "***";
    } else {
      out[k] = redactSensitiveFields(v);
    }
  }
  return out;
}

export function VoiceClient() {
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const [channelName, setChannelName] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [enableAivad, setEnableAivad] = useState(true);
  const [language, setLanguage] = useState("en-US");
  const [profile, setProfile] = useState("");
  const [prompt, setPrompt] = useState("");
  const [greeting, setGreeting] = useState("");
  const [sessionAgentId, setSessionAgentId] = useState<string | null>(null);
  const [sessionPayload, setSessionPayload] = useState<object | null>(null);
  const [sessionPrompt, setSessionPrompt] = useState<string>("");
  const [sessionGreeting, setSessionGreeting] = useState<string>("");
  const [autoConnect, setAutoConnect] = useState(false);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [xHandleOverride, setXHandleOverride] = useState("");
  const [voiceIdOverride, setVoiceIdOverride] = useState("");
  const [selectedMic, setSelectedMic] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("selectedMicId") || ""
      : "",
  );
  const conversationRef = useRef<HTMLDivElement>(null);

  // Read URL parameters on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const backendOverride = getBackendOverride(params);
      if (backendOverride) {
        setBackendUrl(backendOverride);
      }
      const urlProfile = params.get("profile");
      if (urlProfile) {
        setProfile(urlProfile);
      }
      if (params.get("autoconnect") === "true") {
        setAutoConnect(true);
      }
      const ru = params.get("returnurl");
      if (ru) {
        setReturnUrl(ru);
      }
      const xh = params.get("xhandle");
      if (xh) {
        setXHandleOverride(xh);
      }
      const vid = params.get("voice_id");
      if (vid) {
        setVoiceIdOverride(vid);
      }
    }
  }, []);

  const {
    isConnected,
    isMuted,
    micState,
    messageList,
    currentInProgressMessage,
    isAgentSpeaking,
    localAudioTrack,
    joinChannel,
    leaveChannel,
    toggleMute,
    sendMessage,
    agentUid,
    rtmClientRef,
    remoteUserLeftAt,
  } = useAgoraVoiceClient();

  // RTM event source adapter for Thymia hooks
  // Bridges AgoraRTM.RTM events to the RTMEventSource interface
  const rtmSource = useMemo<RTMEventSource | null>(() => {
    const rtm = rtmClientRef.current;
    if (!rtm) return null;
    return {
      on: (event: string, handler: (evt: { message: string | Uint8Array }) => void) => {
        if (event === "message") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (rtm as any).addEventListener("message", handler);
        }
      },
      off: (event: string, handler: (evt: { message: string | Uint8Array }) => void) => {
        if (event === "message") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (rtm as any).removeEventListener("message", handler);
        }
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rtmClientRef.current]);

  // Thymia voice biomarker data (opt-in via NEXT_PUBLIC_ENABLE_THYMIA)
  const {
    biomarkers,
    wellness,
    clinical,
    progress: thymiaProgress,
    safety: thymiaSafety,
  } = useThymia(rtmSource, THYMIA_ENABLED && isConnected);

  // Handle mic selection change: persist to localStorage and live-switch if connected
  const handleMicChange = async (deviceId: string) => {
    setSelectedMic(deviceId);
    if (deviceId) {
      localStorage.setItem("selectedMicId", deviceId);
    } else {
      localStorage.removeItem("selectedMicId");
    }
    if (isConnected && localAudioTrack && deviceId) {
      try {
        await localAudioTrack.setDevice(deviceId);
      } catch (err) {
        console.error("Failed to switch microphone:", err);
      }
    }
  };

  // Get audio visualization data (restart on mute/unmute to fix Web Audio API connection)
  const frequencyData = useAudioVisualization(
    localAudioTrack,
    isConnected && !isMuted,
  );

  const handleStart = async () => {
    setIsLoading(true);
    try {
      // Build query params with agent settings.
      // enable_aivad intentionally omitted — the profile's `ENABLE_AIVAD`
      // env decides the end-of-speech mode now. The toggle in the UI is
      // kept for backwards compatibility but no longer forces an
      // override on every call.
      const params = new URLSearchParams({
        asr_language: language,
      });

      // Add profile override if provided, otherwise use default "VOICE" profile
      if (profile.trim()) {
        params.append("profile", profile.trim());
      } else {
        params.append("profile", DEFAULT_PROFILE);
      }

      // Add prompt and greeting if provided
      if (prompt.trim()) {
        params.append("prompt", prompt.trim());
      }
      if (greeting.trim()) {
        params.append("greeting", greeting.trim());
      }
      if (xHandleOverride) {
        params.append("xhandle", xHandleOverride);
      }
      if (voiceIdOverride) {
        params.append("voice_id", voiceIdOverride);
      }
      // Pass-through latency-test params from page URL
      if (typeof window !== "undefined") {
        const pageParams = new URLSearchParams(window.location.search);
        for (const k of [
          "turn_detection_mode",
          "turn_detection_threshold",
          "turn_detection_prefix_padding_ms",
          "turn_detection_silence_duration_ms",
          "turn_detection_interrupt_duration_ms",
        ]) {
          const v = pageParams.get(k);
          if (v) params.append(k, v);
        }
      }

      // Phase 1: Get tokens only (don't start agent yet)
      params.append("connect", "false");
      const tokenUrl = `${backendUrl}/start-agent?${params.toString()}`;
      const tokenResponse = await fetch(tokenUrl);

      if (!tokenResponse.ok) {
        throw new Error(`Backend error: ${tokenResponse.statusText}`);
      }

      const data = await tokenResponse.json();

      setChannelName(data.channel);

      // Phase 2: Join channel first so RTM is ready for greeting
      await joinChannel({
        appId: data.appid,
        channel: data.channel,
        token: data.token || null,
        uid: parseInt(data.uid),
        rtmUid: data.user_rtm_uid,
        agentUid: data.agent?.uid ? String(data.agent.uid) : undefined,
        agentRtmUid: data.agent_rtm_uid,
        ...(selectedMic ? { microphoneId: selectedMic } : {}),
      });

      // Phase 3: Now start the agent (client is listening for greeting)
      params.delete("connect");
      params.append("channel", data.channel);
      params.append("debug", "true");
      const agentUrl = `${backendUrl}/start-agent?${params.toString()}`;
      const agentResponse = await fetch(agentUrl);

      if (!agentResponse.ok) {
        throw new Error(`Agent start error: ${agentResponse.statusText}`);
      }

      const agentData = await agentResponse.json();

      // Store agent_id from the actual agent response
      if (agentData.agent_response?.response) {
        try {
          const resp =
            typeof agentData.agent_response.response === "string"
              ? JSON.parse(agentData.agent_response.response)
              : agentData.agent_response.response;
          if (resp.agent_id) {
            setAgentId(resp.agent_id);
            setSessionAgentId(resp.agent_id);
          }
        } catch {
          // ignore parse errors
        }
      }

      // Store redacted payload for session panel
      if (agentData.debug?.agent_payload) {
        setSessionPayload(redactSensitiveFields(agentData.debug.agent_payload));
        const resolved = extractResolvedPromptAndGreeting(agentData.debug.agent_payload);
        setSessionPrompt(resolved.prompt);
        setSessionGreeting(resolved.greeting);
      }
    } catch (error) {
      console.error("Failed to start:", error);
      alert(
        `Failed to start: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-connect after state is committed
  useEffect(() => {
    if (autoConnect) {
      setAutoConnect(false);
      handleStart();
    }
  }, [autoConnect]);

  const handleStop = async () => {
    // Call hangup-agent on backend to clean up server-side resources
    if (agentId) {
      try {
        const params = new URLSearchParams({ agent_id: agentId });
        if (channelName) params.append("channel", channelName);
        if (profile.trim()) params.append("profile", profile.trim());
        await fetch(`${backendUrl}/hangup-agent?${params}`);
      } catch (e) {
        console.error("Hangup failed:", e);
      }
    }
    setAgentId(undefined);
    setChannelName(undefined);
    setSessionAgentId(null);
    setSessionPayload(null);
    setSessionPrompt("");
    setSessionGreeting("");
    await leaveChannel();
    if (returnUrl) {
      window.location.href = returnUrl;
      return;
    }
  };

  // If the remote agent leaves the channel while we have an active session,
  // the server (or ConvoAI) ended the call — clean up like the user pressed stop.
  useEffect(() => {
    if (remoteUserLeftAt && agentId) {
      handleStop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteUserLeftAt]);

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !isConnected) return;

    const success = await sendMessage(chatMessage);
    if (success) {
      setChatMessage("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getAgentState = (): AgentVisualizerState => {
    const state = !isConnected
      ? "not-joined"
      : isAgentSpeaking
        ? "talking"
        : "listening";
    return state;
  };

  // Helper to determine if message is from agent
  // Agent messages have uid matching the agent's RTC UID (provided by backend)
  const isAgentMessage = (uid: string) => {
    return agentUid ? uid === agentUid : false;
  };

  const formatTime = (ts?: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-3 md:py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
              <AgoraLogo size={28} />
              <span className="hidden md:inline">Agora Convo AI </span>Voice Agent
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground ml-10">
              React with Agora AI UIKit
            </p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="cursor-pointer rounded-full p-2 hover:bg-accent transition-colors"
              aria-label="Toggle settings"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 px-4 py-6 min-h-0 overflow-hidden min-w-0">
        {!isConnected ? (
          /* Connection Form - Centered (same as original) */
          <div className="flex flex-1 items-center justify-center">
            {(autoConnect || isLoading) && !isConnected ? (
              <p className="text-lg text-muted-foreground animate-pulse">
                Connecting...
              </p>
            ) : (
              <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
                <h2 className="mb-4 text-lg font-semibold">Connect to Agent</h2>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="backend"
                      className="mb-2 block text-sm font-medium"
                    >
                      Backend URL
                    </label>
                    <input
                      id="backend"
                      type="text"
                      value={backendUrl}
                      onChange={(e) => setBackendUrl(e.target.value)}
                      placeholder={DEFAULT_BACKEND_URL}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="profile"
                      className="mb-2 block text-sm font-medium"
                    >
                      Server Profile
                    </label>
                    <input
                      id="profile"
                      type="text"
                      value={profile}
                      onChange={(e) => setProfile(e.target.value)}
                      placeholder={DEFAULT_PROFILE}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Leave empty for default &ldquo;{DEFAULT_PROFILE}&rdquo;
                      profile
                    </p>
                  </div>

                  <button
                    onClick={handleStart}
                    disabled={isLoading}
                    className="cursor-pointer w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isLoading ? "Connecting..." : "Start Call"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Connected: two-panel layout */
          <div className="flex flex-1 flex-col gap-4 min-h-0 overflow-hidden md:flex-row md:gap-6">
            {/* Mobile: Compact Agent Status Bar */}
            <div className="flex items-center justify-center rounded-lg border bg-card p-3 shadow-lg md:hidden">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "h-3 w-3 rounded-full",
                    isAgentSpeaking
                      ? "bg-green-500 animate-pulse"
                      : "bg-blue-500",
                  )}
                />
                <span className="text-sm font-medium">
                  {isAgentSpeaking ? "Agent Speaking" : "Listening"}
                </span>
              </div>
            </div>

            {/* Desktop: Left Column (visualizer + controls) */}
            <div className="hidden md:flex md:w-96 flex-col gap-6 self-stretch">
              {/* Agent Visualizer */}
              <div className="rounded-lg border bg-card p-6 shadow-lg flex-shrink">
                <AgentVisualizer
                  state={getAgentState()}
                  size="sm"
                />
                <p className="mt-2 text-xs text-center text-muted-foreground">
                  {isAgentSpeaking ? "Agent Speaking" : "Agent Listening"}
                </p>
              </div>

              {/* Controls */}
              <div className="rounded-lg border bg-card p-6 shadow-lg">
                <div className="flex gap-3 justify-center">
                  <IconButton
                    shape="square"
                    variant={isMuted ? "standard" : "filled"}
                    size="md"
                    onClick={toggleMute}
                    className={
                      isMuted
                        ? "rounded-lg bg-muted text-destructive hover:bg-muted/80"
                        : "rounded-lg"
                    }
                  >
                    {isMuted ? (
                      <MicOff className="size-4" />
                    ) : (
                      <Mic className="size-4" />
                    )}
                  </IconButton>
                  <button
                    onClick={handleStop}
                    className="cursor-pointer flex items-center gap-2 rounded-lg bg-destructive px-5 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                  >
                    <PhoneOff className="h-4 w-4" />
                    End Call
                  </button>
                </div>
              </div>

              {/* Status */}
              <div className="rounded-lg border bg-card p-4 shadow-lg flex-1 flex flex-col justify-center">
                <div className="space-y-2 text-sm">
                  {agentUid && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Agent:</span>
                      <span className="font-mono font-medium">{agentUid}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mic:</span>
                    <span className="font-mono font-medium">
                      {isMuted ? "Muted" : "Active"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Conversation + optional Thymia tab */}
            <div
              ref={conversationRef}
              className="flex flex-1 flex-col min-h-0 overflow-hidden"
            >
              <MobileTabs
                tabs={[
                  {
                    id: "chat",
                    label: "Chat",
                    content: (
                      <div className="flex flex-1 flex-col min-h-0 overflow-hidden h-full">
                        {/* Conversation Header */}
                        <div className="border-b p-4 flex-shrink-0">
                          <h2 className="font-semibold">Conversation</h2>
                          <p className="text-sm text-muted-foreground">
                            {messageList.length} message
                            {messageList.length !== 1 ? "s" : ""}
                          </p>
                        </div>

                        {/* Messages */}
                        <Conversation
                          height=""
                          className="flex-1 min-h-0"
                          style={{ overflow: "auto" }}
                        >
                          <ConversationContent className="gap-3">
                            {messageList.map((msg, idx) => {
                              const isAgent = isAgentMessage(msg.uid);
                              const label = isAgent ? "Agent" : "You";
                              const time = formatTime(msg.timestamp);
                              return (
                                <Message
                                  key={`${msg.turn_id}-${msg.uid}-${idx}`}
                                  from={isAgent ? "assistant" : "user"}
                                  name={time ? `${label}  ${time}` : label}
                                >
                                  <MessageContent
                                    className={
                                      isAgent
                                        ? "px-3 py-2"
                                        : "px-3 py-2 bg-foreground text-background"
                                    }
                                  >
                                    <Response>{msg.text}</Response>
                                  </MessageContent>
                                </Message>
                              );
                            })}

                            {/* In-progress message */}
                            {currentInProgressMessage &&
                              (() => {
                                const isAgent = isAgentMessage(
                                  currentInProgressMessage.uid,
                                );
                                const label = isAgent ? "Agent" : "You";
                                const time = formatTime(
                                  currentInProgressMessage.timestamp,
                                );
                                return (
                                  <Message
                                    from={isAgent ? "assistant" : "user"}
                                    name={time ? `${label}  ${time}` : label}
                                  >
                                    <MessageContent
                                      className={`animate-pulse px-3 py-2 ${isAgent ? "" : "bg-foreground text-background"}`}
                                    >
                                      <Response>
                                        {currentInProgressMessage.text}
                                      </Response>
                                    </MessageContent>
                                  </Message>
                                );
                              })()}
                          </ConversationContent>
                        </Conversation>

                        {/* Input Box */}
                        <div className="border-t p-3 md:p-4 flex-shrink-0">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={chatMessage}
                              onChange={(e) => setChatMessage(e.target.value)}
                              onKeyPress={handleKeyPress}
                              placeholder="Type a message"
                              disabled={!isConnected}
                              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                            />
                            <button
                              onClick={handleSendMessage}
                              disabled={!isConnected || !chatMessage.trim()}
                              className="cursor-pointer h-10 w-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                              <SendHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ),
                  },
                  ...(THYMIA_ENABLED
                    ? [
                        {
                          id: "thymia",
                          label: "Thymia",
                          content: (
                            <ThymiaPanel
                              biomarkers={biomarkers}
                              wellness={wellness}
                              clinical={clinical}
                              progress={thymiaProgress}
                              safety={thymiaSafety}
                              isConnected={isConnected}
                            />
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </div>

            {/* Mobile: Fixed Bottom Controls */}
            <div className="flex md:hidden gap-3 p-4 border-t bg-card justify-center items-center">
              <IconButton
                shape="square"
                variant={isMuted ? "standard" : "filled"}
                size="md"
                onClick={toggleMute}
                className={
                  isMuted
                    ? "rounded-lg bg-muted text-destructive hover:bg-muted/80"
                    : "rounded-lg"
                }
              >
                {isMuted ? (
                  <MicOff className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )}
              </IconButton>
              <button
                onClick={handleStop}
                className="cursor-pointer flex items-center gap-2 rounded-lg bg-destructive px-5 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                <PhoneOff className="h-4 w-4" />
                End Call
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Settings Dialog */}
      <SettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        enableAivad={enableAivad}
        onEnableAivadChange={setEnableAivad}
        language={language}
        onLanguageChange={setLanguage}
        prompt={prompt}
        onPromptChange={setPrompt}
        greeting={greeting}
        onGreetingChange={setGreeting}
        disabled={isConnected}
        selectedMicId={selectedMic}
        onMicChange={handleMicChange}
      >
        <SessionInfoPanel
          agentId={sessionAgentId}
          greeting={sessionGreeting}
          prompt={sessionPrompt}
          payload={sessionPayload}
        />
      </SettingsDialog>
    </div>
  );
}
