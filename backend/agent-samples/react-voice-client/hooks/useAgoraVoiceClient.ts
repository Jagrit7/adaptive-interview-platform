"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import AgoraRTC, {
  IMicrophoneAudioTrack,
  IRemoteAudioTrack,
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

export type VoiceClientConfig = {
  appId: string;
  channel: string;
  token: string | null;
  uid: number;
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
}

export function useAgoraVoiceClient() {
  const [localAudioTrack, setLocalAudioTrack] =
    useState<IMicrophoneAudioTrack | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micState, setMicState] = useState<MicButtonState>("idle");
  const [messageList, setMessageList] = useState<IMessageListItem[]>([]);
  const [currentInProgressMessage, setCurrentInProgressMessage] =
    useState<IMessageListItem | null>(null);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [remoteUserLeftAt, setRemoteUserLeftAt] = useState<number>(0);
  const [agentUid, setAgentUid] = useState<string | undefined>(undefined);
  const [agentRtmUid, setAgentRtmUid] = useState<string | undefined>(undefined);
  const [remoteAudioTrack, setRemoteAudioTrack] =
    useState<IRemoteAudioTrack | null>(null);

  const rtcClientRef = useRef<IAgoraRTCClient | null>(null);
  const rtmClientRef = useRef<InstanceType<typeof AgoraRTM.RTM> | null>(null);
  const voiceAIRef = useRef<AgoraVoiceAI | null>(null);
  const volumeCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Tracks RTC track-event handlers so they can be unregistered on leave.
  const rtcTrackHandlersRef = useRef<{
    onPublished?: (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video") => void;
    onUnpublished?: (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video") => void;
    onLeft?: () => void;
  }>({});

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

        const isAllZero = volumes.length >= 2 && volumes.every((v) => v === 0);
        const hasSound = volumes.length >= 2 && volumes.some((v) => v > 0);

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

      setLocalAudioTrack(null);
      setIsConnected(false);
      setMicState("idle");
      setIsAgentSpeaking(false);
      setMessageList([]);
      setCurrentInProgressMessage(null);
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
          if (mediaType === "audio") {
            await rtcClient.subscribe(user, mediaType);
            user.audioTrack?.play();
            setRemoteAudioTrack(user.audioTrack ?? null);
            setIsAgentSpeaking(true);
          }
        };
        const onUnpublished = (
          _user: IAgoraRTCRemoteUser,
          mediaType: "audio" | "video",
        ) => {
          if (mediaType === "audio") {
            setIsAgentSpeaking(false);
            setRemoteAudioTrack(null);
          }
        };
        const onLeft = () => {
          setIsAgentSpeaking(false);
          setRemoteAudioTrack(null);
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

        // Initialize AgoraVoiceAI
        const voiceAI = await AgoraVoiceAI.init({
          rtcEngine: rtcClient,
          rtmConfig: { rtmEngine: rtmClient },
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: false,
        });

        // Listen to transcript updates
        voiceAI.on(
          AgoraVoiceAIEvents.TRANSCRIPT_UPDATED,
          (messages: TranscriptHelperItem[]) => {
            const fixSpacing = (t: string) =>
              t.replace(/([.!?,:;])([A-Za-z])/g, "$1 $2");
            const convertedMessages = messages.map((m) => ({
              turn_id: m.turn_id,
              uid: m.uid,
              text: fixSpacing(m.text),
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

        // Login RTM, subscribe to channel for server-pushed messages (e.g. Thymia biomarkers),
        // and join RTC channel
        await rtmClient.login({ token: config.token ?? undefined });
        await rtmClient.subscribe(config.channel, { withMessage: true });
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

        // Subscribe to AI messages on the channel
        voiceAI.subscribeMessage(config.channel);

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
    [agentRtmUid],
  );

  return {
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
  };
}
