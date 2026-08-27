/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import AgoraRTC, {
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
  IAgoraRTCClient,
} from "agora-rtc-sdk-ng";
import AgoraRTM from "agora-rtm";
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  TurnStatus,
  TranscriptHelperMode,
  ChatMessageType,
  ChatMessagePriority,
  type TranscriptHelperItem,
} from "agora-agent-client-toolkit";
import { MicButtonState } from "@agora/agent-ui-kit";
import {
  extractFinalTranscriptLine,
  type MeetingTranscriptLine,
} from "@/lib/agoraSttProto";

export type VoiceClientConfig = {
  appId: string;
  channel: string;
  token: string | null;
  uid: number;
  mode?: "avatar" | "meeting";
  participantRole?: "host" | "guest";
  transcriptionEnabled?: boolean;
  rtmUid?: string;
  agentUid?: string;
  agentRtmUid?: string;
  microphoneId?: string;
};

export interface IMessageListItem {
  turn_id: number;
  uid: string;
  text: string;
  status: number;
  timestamp?: number;
  role?: "host" | "guest";
  messageId?: string;
}

export function useAgoraVideoClient() {
  const [localAudioTrack, setLocalAudioTrack] =
    useState<IMicrophoneAudioTrack | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micState, setMicState] = useState<MicButtonState>("idle");
  const [messageList, setMessageList] = useState<IMessageListItem[]>([]);
  const [currentInProgressMessage, setCurrentInProgressMessage] =
    useState<IMessageListItem | null>(null);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [agentUid, setAgentUid] = useState<string | undefined>(undefined);
  const [agentRtmUid, setAgentRtmUid] = useState<string | undefined>(undefined);
  const [sessionMode, setSessionMode] = useState<"avatar" | "meeting">("avatar");
  const [remoteAudioTrack, setRemoteAudioTrack] = useState<any>(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<any>(null);
  const [remoteUserLeftAt, setRemoteUserLeftAt] = useState<number>(0);

  const rtcClientRef = useRef<IAgoraRTCClient | null>(null);
  const rtmClientRef = useRef<InstanceType<typeof AgoraRTM.RTM> | null>(null);
  const voiceAIRef = useRef<AgoraVoiceAI | null>(null);
  // Tracks RTC track-event handlers so they can be unregistered on leave.
  const rtcTrackHandlersRef = useRef<{
    onPublished?: (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video") => void;
    onUnpublished?: (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video") => void;
    onLeft?: () => void;
  }>({});
  const volumeCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentChannelRef = useRef<string>("");
  const currentParticipantUidRef = useRef<string>("");
  const currentParticipantRoleRef = useRef<"host" | "guest">("guest");
  const seenMeetingMessageIdsRef = useRef<Set<string>>(new Set());
  const currentMeetingTranscriptionEnabledRef = useRef(false);
  const meetingTranscriptLinesRef = useRef<MeetingTranscriptLine[]>([]);
  const seenTranscriptLineKeysRef = useRef<Set<string>>(new Set());

  // Simple fan-out for RTM messages — one Agora addEventListener, many subscribers.
  // Agora RTM may not support multiple addEventListener calls for the same event,
  // so we use a single listener and dispatch to all registered handlers ourselves.
  type RTMHandler = (event: { message: string | Uint8Array }) => void;
  const rtmListenersRef = useRef<Set<RTMHandler>>(new Set());
  const [rtmSource, setRtmSource] = useState<{
    on: (event: string, handler: RTMHandler) => void;
    off: (event: string, handler: RTMHandler) => void;
  } | null>(null);

  // The web RTM SDK can log a presence-collection error even when we subscribe
  // with `withPresence: false` and plain channel messaging is working.
  // This app does not use client-side presence, so drop just that noisy warning.
  useEffect(() => {
    const origConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      const msg = args.map((a) => String(a)).join(" ");
      if (
        msg.includes("joinPresenceColl error") &&
        msg.includes("Presence service not connected")
      ) {
        return;
      }
      origConsoleError.apply(console, args);
    };

    return () => {
      console.error = origConsoleError;
    };
  }, []);

  // Handlers are registered inside joinChannel against the freshly-created
  // rtcClient (and cleaned up inside leaveChannel). This avoids a stale-ref
  // race that previously caused the second session to miss `user-published`.

  // Monitor remote audio volume levels
  useEffect(() => {
    if (!remoteAudioTrack) {
      if (volumeCheckIntervalRef.current) {
        clearInterval(volumeCheckIntervalRef.current);
        volumeCheckIntervalRef.current = null;
      }
      return;
    }

    const volumes: number[] = [];
    volumeCheckIntervalRef.current = setInterval(() => {
      if (
        remoteAudioTrack &&
        typeof remoteAudioTrack.getVolumeLevel === "function"
      ) {
        const volume = remoteAudioTrack.getVolumeLevel();
        volumes.push(volume);
        if (volumes.length > 3) volumes.shift();

        const isAllZero = volumes.length >= 2 && volumes.every((v: number) => v === 0);
        const hasSound = volumes.length >= 2 && volumes.some((v: number) => v > 0);

        if (isAllZero && isAgentSpeaking) {
          setIsAgentSpeaking(false);
        } else if (hasSound && !isAgentSpeaking) {
          setIsAgentSpeaking(true);
        }
      }
    }, 100);

    return () => {
      if (volumeCheckIntervalRef.current) {
        clearInterval(volumeCheckIntervalRef.current);
        volumeCheckIntervalRef.current = null;
      }
    };
  }, [remoteAudioTrack, isAgentSpeaking]);

  const leaveChannel = useCallback(async () => {
    try {
      if (voiceAIRef.current) {
        voiceAIRef.current.unsubscribe();
        voiceAIRef.current.destroy();
        voiceAIRef.current = null;
      }

      if (rtmClientRef.current) {
        await rtmClientRef.current.logout();
        rtmClientRef.current = null;
      }

      if (rtcClientRef.current) {
        const handlers = rtcTrackHandlersRef.current;
        if (handlers.onPublished) rtcClientRef.current.off("user-published", handlers.onPublished);
        if (handlers.onUnpublished) rtcClientRef.current.off("user-unpublished", handlers.onUnpublished);
        if (handlers.onLeft) rtcClientRef.current.off("user-left", handlers.onLeft);
        rtcTrackHandlersRef.current = {};
        await rtcClientRef.current.leave();
        rtcClientRef.current = null;
      }

      rtmListenersRef.current.clear();
      setRtmSource(null);
      setLocalAudioTrack(null);
      setIsConnected(false);
      setMicState("idle");
      setIsAgentSpeaking(false);
      setMessageList([]);
      setCurrentInProgressMessage(null);
      setSessionMode("avatar");
      setRemoteVideoTrack(null);
      currentMeetingTranscriptionEnabledRef.current = false;
      meetingTranscriptLinesRef.current = [];
      seenTranscriptLineKeysRef.current.clear();
    } catch (error) {
      console.error("Error leaving channel:", error);
    }
  }, []);

  const joinChannel = useCallback(
    async (config: VoiceClientConfig) => {
      if (isConnected) {
        await leaveChannel();
      }

      try {
        const mode = config.mode || "avatar";
        setSessionMode(mode);
        currentChannelRef.current = config.channel;
        currentParticipantUidRef.current = String(config.uid);
        currentParticipantRoleRef.current =
          config.participantRole === "host" ? "host" : "guest";
        currentMeetingTranscriptionEnabledRef.current = Boolean(
          config.transcriptionEnabled,
        );
        meetingTranscriptLinesRef.current = [];
        seenTranscriptLineKeysRef.current.clear();
        seenMeetingMessageIdsRef.current.clear();
        // Store agent UIDs from backend
        if (config.agentUid) setAgentUid(config.agentUid);
        if (config.agentRtmUid) setAgentRtmUid(config.agentRtmUid);

        // Create RTC client
        const rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        rtcClientRef.current = rtcClient;

        // Register track-event handlers immediately so we don't miss the
        // agent's first `user-published` event during cold start.
        const onPublished = async (
          user: IAgoraRTCRemoteUser,
          mediaType: "audio" | "video",
        ) => {
          await rtcClient.subscribe(user, mediaType);
          if (mediaType === "audio") {
            user.audioTrack?.play();
            setRemoteAudioTrack(user.audioTrack ?? null);
            setIsAgentSpeaking(true);
          } else {
            setRemoteVideoTrack(user.videoTrack ?? null);
          }
        };
        const onUnpublished = (
          _user: IAgoraRTCRemoteUser,
          mediaType: "audio" | "video",
        ) => {
          if (mediaType === "audio") {
            setIsAgentSpeaking(false);
            setRemoteAudioTrack(null);
          } else {
            setRemoteVideoTrack(null);
          }
        };
        const onLeft = () => {
          setIsAgentSpeaking(false);
          setRemoteAudioTrack(null);
          setRemoteVideoTrack(null);
          setRemoteUserLeftAt(Date.now());
        };
        rtcClient.on("user-published", onPublished);
        rtcClient.on("user-unpublished", onUnpublished);
        rtcClient.on("user-left", onLeft);
        rtcTrackHandlersRef.current = { onPublished, onUnpublished, onLeft };

        // Create RTM client
        const rtmUid = config.rtmUid || `${config.uid}`;
        const rtmClient = new AgoraRTM.RTM(config.appId, rtmUid);
        rtmClientRef.current = rtmClient;

        if (mode === "avatar") {
          const voiceAI = await AgoraVoiceAI.init({
            rtcEngine: rtcClient,
            rtmConfig: { rtmEngine: rtmClient },
            renderMode: TranscriptHelperMode.AUTO,
            enableLog: false,
          });

          voiceAI.on(
            AgoraVoiceAIEvents.TRANSCRIPT_UPDATED,
            (messages: TranscriptHelperItem[]) => {
              const convertedMessages = messages.map((m) => ({
                turn_id: m.turn_id,
                uid: m.uid,
                text: m.text,
                status: m.status,
                timestamp: m.timestamp,
              }));

              const completedMessages = convertedMessages
                .filter((msg) => msg.status !== TurnStatus.IN_PROGRESS)
                .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

              const inProgress = convertedMessages.find(
                (msg) => msg.status === TurnStatus.IN_PROGRESS,
              );

              setMessageList(completedMessages);
              setCurrentInProgressMessage(inProgress || null);
            },
          );

          voiceAIRef.current = voiceAI;
        } else {
          voiceAIRef.current = null;
          setMessageList([]);
          setCurrentInProgressMessage(null);
        }

        // Login RTM, subscribe to channel for server-pushed messages (e.g. Thymia biomarkers),
        // and join RTC channel
        await rtmClient.login({ token: config.token ?? undefined });
        await rtmClient.subscribe(config.channel, { withMessage: true, withPresence: false });

        // Single RTM message listener — fans out to all registered handlers.
        // Also logs incoming messages for debugging.
        rtmClient.addEventListener("message", (event: any) => {
          try {
            let raw: string;
            if (typeof event.message === "string") {
              raw = event.message;
            } else if (event.message instanceof Uint8Array) {
              raw = new TextDecoder().decode(event.message);
            } else {
              return;
            }
            const parsed = JSON.parse(raw);
            if (mode === "meeting" && parsed?.object === "meeting_chat") {
              const messageId = String(parsed.message_id || "");
              if (messageId && seenMeetingMessageIdsRef.current.has(messageId)) {
                return;
              }
              if (messageId) {
                seenMeetingMessageIdsRef.current.add(messageId);
              }
              const timestamp = Number(parsed.timestamp || Date.now());
              const senderUid = String(parsed.sender_uid || event.publisher || "unknown");
              const senderRole =
                parsed.sender_role === "host" ? "host" : "guest";
              setMessageList((prev) => [
                ...prev,
                {
                  turn_id: timestamp,
                  uid: senderUid,
                  role: senderRole,
                  text: String(parsed.text || ""),
                  status: 2,
                  timestamp,
                  messageId: messageId || `${senderUid}:${timestamp}`,
                },
              ]);
              return;
            }
            console.log("[RTM]", parsed.object, "len:", raw.length);
          } catch {
            // skip
          }
          // Dispatch to all registered subscribers
          for (const handler of rtmListenersRef.current) {
            try {
              handler(event);
            } catch {
              // skip
            }
          }
        });

        // Create the RTMEventSource that hooks can subscribe to
        setRtmSource({
          on: (_event: string, handler: RTMHandler) => {
            rtmListenersRef.current.add(handler);
          },
          off: (_event: string, handler: RTMHandler) => {
            rtmListenersRef.current.delete(handler);
          },
        });

        if (mode === "meeting" && currentMeetingTranscriptionEnabledRef.current) {
          rtcClient.on(
            "stream-message",
            (_uid: number, data: Uint8Array | ArrayBuffer) => {
              const line = extractFinalTranscriptLine(data);
              if (!line) return;
              const transcriptKey = `${line.uid}:${line.time}:${line.text}`;
              if (seenTranscriptLineKeysRef.current.has(transcriptKey)) {
                return;
              }
              seenTranscriptLineKeysRef.current.add(transcriptKey);
              meetingTranscriptLinesRef.current = [
                ...meetingTranscriptLinesRef.current,
                line,
              ];
            },
          );
        }

        await rtcClient.join(
          config.appId,
          config.channel,
          config.token,
          config.uid,
        );

        // Create and publish audio track
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: "high_quality_stereo",
          AEC: true,
          ANS: true,
          AGC: true,
          ...(config.microphoneId
            ? { microphoneId: config.microphoneId }
            : {}),
        });
        await rtcClient.publish([audioTrack]);

        if (mode === "avatar" && voiceAIRef.current) {
          voiceAIRef.current.subscribeMessage(config.channel);
        }

        setLocalAudioTrack(audioTrack);
        setIsConnected(true);
        setMicState("listening");
      } catch (error) {
        console.error("Error joining channel:", error);
        throw error;
      }
    },
    [isConnected, leaveChannel],
  );

  const toggleMute = useCallback(async () => {
    const track = localAudioTrack;
    if (!track) return;

    try {
      await track.setEnabled(isMuted);
      setIsMuted(!isMuted);
      setMicState(!isMuted ? "idle" : "listening");
    } catch (error) {
      console.error("Error toggling mute:", error);
    }
  }, [isMuted, localAudioTrack]);

  const sendMessage = useCallback(
    async (message: string, targetUid?: string) => {
      if (sessionMode === "meeting") {
        const rtmClient = rtmClientRef.current as any;
        const channel = currentChannelRef.current;
        if (!rtmClient || !channel) {
          console.error("Cannot send meeting message: RTM not initialized");
          return false;
        }
        const timestamp = Date.now();
        const messageId = `${currentParticipantRoleRef.current}:${currentParticipantUidRef.current}:${timestamp}`;
        const payload = {
          object: "meeting_chat",
          message_id: messageId,
          sender_uid: currentParticipantUidRef.current,
          sender_role: currentParticipantRoleRef.current,
          text: message,
          timestamp,
        };
        try {
          seenMeetingMessageIdsRef.current.add(messageId);
          setMessageList((prev) => [
            ...prev,
            {
              turn_id: timestamp,
              uid: currentParticipantUidRef.current,
              role: currentParticipantRoleRef.current,
              text: message,
              status: 2,
              timestamp,
              messageId,
            },
          ]);
          await rtmClient.publish?.(channel, JSON.stringify(payload));
          return true;
        } catch (error) {
          console.error("Error sending meeting message:", error);
          setMessageList((prev) =>
            prev.filter((item) => item.messageId !== messageId),
          );
          seenMeetingMessageIdsRef.current.delete(messageId);
          return false;
        }
      }

      const voiceAI = voiceAIRef.current;
      if (!voiceAI) {
        console.error("Cannot send message: AgoraVoiceAI not initialized");
        return false;
      }

      const uid = targetUid || agentRtmUid;
      if (!uid) {
        console.error("Cannot send message: no agent RTM UID available");
        return false;
      }

      try {
        await voiceAI.chat(uid, {
          messageType: ChatMessageType.TEXT,
          text: message,
          priority: ChatMessagePriority.INTERRUPTED,
          responseInterruptable: true,
        });
        return true;
      } catch (error) {
        console.error("Error sending message:", error);
        return false;
      }
    },
    [agentRtmUid, sessionMode],
  );

  const getMeetingTranscriptArtifact = useCallback(() => {
    if (!currentMeetingTranscriptionEnabledRef.current) {
      return null;
    }
    const lines = meetingTranscriptLinesRef.current.slice();
    const text = lines
      .map((line) => line.text)
      .filter(Boolean)
      .join("\n")
      .trim();
    return {
      text,
      lines,
      warning: text ? "" : "No transcript text was captured before the meeting ended.",
      metadata: {
        captured_via: "rtc_stream_message",
        line_count: lines.length,
      },
    };
  }, []);

  return {
    isConnected,
    isMuted,
    micState,
    messageList,
    currentInProgressMessage,
    isAgentSpeaking,
    localAudioTrack,
    remoteVideoTrack,
    remoteUserLeftAt,
    joinChannel,
    leaveChannel,
    toggleMute,
    sendMessage,
    agentUid,
    sessionMode,
    getMeetingTranscriptArtifact,
    rtcClientRef,
    rtmClientRef,
    rtmSource,
  };
}
