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
  MessageType,
  type TranscriptHelperItem,
  type UserTranscription,
  type AgentTranscription,
} from "agora-agent-client-toolkit";

/** The toolkit's own TRANSCRIPT_UPDATED payload type. Named here because the
 *  bare `TranscriptHelperItem` is generic and will not compile without its
 *  type argument - which is why `next build` was failing type checking, and
 *  therefore why the frontend Docker image could not be built. */
type TranscriptItem = TranscriptHelperItem<
  Partial<UserTranscription | AgentTranscription>
>;
type MicButtonState = "idle" | "listening" | "speaking";

function describeVoiceError(error: unknown): string {
  const value = error as { name?: string; code?: string | number; message?: string };
  const name = value?.name ?? "";
  const code = String(value?.code ?? "").toUpperCase();
  const message = value?.message ?? String(error);
  const detail = `${name} ${code} ${message}`.toLowerCase();

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return "Microphone access requires a secure browser context. Open the interview on localhost or HTTPS.";
  }
  if (name === "NotAllowedError" || detail.includes("permission_denied") || detail.includes("permission denied")) {
    return "Microphone access is blocked. Allow microphone access for this site in your browser settings, then reload the interview.";
  }
  if (name === "NotFoundError" || detail.includes("notfounderror") || detail.includes("no audio input")) {
    return "No microphone was found. Connect or enable an input device, then reload the interview.";
  }
  if (name === "NotReadableError" || detail.includes("notreadableerror") || detail.includes("could not start audio source")) {
    return "The microphone is busy or unavailable. Close other apps using it, then retry the interview.";
  }
  if (name === "OverconstrainedError" || detail.includes("overconstrained")) {
    return "The selected microphone is no longer available. Choose another input device and retry.";
  }
  return message || "The interview audio connection could not be established.";
}

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
  source: "candidate" | "agent" | "unknown";
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
  const [isAgentListening, setIsAgentListening] = useState(false);
  const [inputVolume, setInputVolume] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [remoteUserLeftAt, setRemoteUserLeftAt] = useState<number>(0);
  const [agentTurnFinishedSequence, setAgentTurnFinishedSequence] = useState(0);
  const [agentSpeakingStartedSequence, setAgentSpeakingStartedSequence] = useState(0);
  const [lastStartedAgentUid, setLastStartedAgentUid] = useState<string | null>(null);
  const [lastFinishedAgentUid, setLastFinishedAgentUid] = useState<string | null>(null);
  const [agentUid, setAgentUid] = useState<string | undefined>(undefined);
  const [agentRtmUid, setAgentRtmUid] = useState<string | undefined>(undefined);
  const [remoteAudioTrack, setRemoteAudioTrack] =
    useState<IRemoteAudioTrack | null>(null);

  const rtcClientRef = useRef<IAgoraRTCClient | null>(null);
  const rtmClientRef = useRef<InstanceType<typeof AgoraRTM.RTM> | null>(null);
  const voiceAIRef = useRef<AgoraVoiceAI | null>(null);
  const volumeCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localVolumeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Mirrors localAudioTrack so leaveChannel - which has an empty dep array on
  // purpose, to stay referentially stable - can close the CURRENT track rather
  // than whichever one existed when the callback was created.
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const remoteAudioUidRef = useRef<string | null>(null);
  // Every concurrent interviewer publishes an RTC audio track. Subscribing is
  // required so the toolkit can receive its events, but PLAYBACK must obey the
  // orchestrator's single-speaker floor. Previously every published track was
  // played immediately, allowing an autonomous Agora response from the host to
  // talk over the specialist selected by the backend.
  const remoteAudioTracksRef = useRef<Map<string, IRemoteAudioTrack>>(new Map());
  const audibleAgentUidRef = useRef<string | null>(null);
  const speakingAgentUidsRef = useRef<Set<string>>(new Set());
  // Tracks RTC track-event handlers so they can be unregistered on leave.
  const rtcTrackHandlersRef = useRef<{
    onPublished?: (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video") => void;
    onUnpublished?: (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video") => void;
    onLeft?: (user: IAgoraRTCRemoteUser) => void;
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
    // Each resource is torn down in its OWN try/catch, deliberately.
    //
    // This used to be one try/catch around the whole sequence. If
    // voiceAI.unsubscribe() or destroy() threw - which happens when the agent
    // has already gone away - the RTM logout below it never ran, the error was
    // swallowed by the catch, and the RTM session stayed logged in on Agora's
    // side. The next join with the same uid then failed with
    // "-10027: user ID is already in use by another active RTM instance".
    //
    // RTM logout is the one step that must never be skipped, so nothing above
    // it is allowed to prevent it from being attempted.

    try {
      if (voiceAIRef.current) {
        voiceAIRef.current.unsubscribe();
        voiceAIRef.current.destroy();
      }
    } catch (e) {
      console.warn("voiceAI teardown failed (continuing):", e);
    } finally {
      voiceAIRef.current = null;
    }

    try {
      if (rtmClientRef.current) {
        await rtmClientRef.current.logout();
      }
    } catch (e) {
      // Already logged out, or the socket died. Either way the ref must be
      // cleared so a retry can build a fresh client.
      console.warn("RTM logout failed (continuing):", e);
    } finally {
      rtmClientRef.current = null;
    }

    // The mic device stays held until the track is closed. Dropping the
    // reference with setLocalAudioTrack(null) alone left the browser's
    // recording indicator lit after leaving the room.
    try {
      const track = localAudioTrackRef.current;
      if (track) {
        track.stop();
        track.close();
      }
    } catch (e) {
      console.warn("local track close failed (continuing):", e);
    } finally {
      localAudioTrackRef.current = null;
      if (localVolumeIntervalRef.current) {
        clearInterval(localVolumeIntervalRef.current);
        localVolumeIntervalRef.current = null;
      }
    }

    try {
      if (rtcClientRef.current) {
        const handlers = rtcTrackHandlersRef.current;
        if (handlers.onPublished) rtcClientRef.current.off("user-published", handlers.onPublished);
        if (handlers.onUnpublished) rtcClientRef.current.off("user-unpublished", handlers.onUnpublished);
        if (handlers.onLeft) rtcClientRef.current.off("user-left", handlers.onLeft);
        rtcTrackHandlersRef.current = {};
        await rtcClientRef.current.leave();
      }
    } catch (e) {
      console.warn("RTC leave failed (continuing):", e);
    } finally {
      rtcClientRef.current = null;
    }

    for (const track of remoteAudioTracksRef.current.values()) {
      try {
        track.stop();
      } catch {
        // The remote participant may already have unpublished the track.
      }
    }
    remoteAudioTracksRef.current.clear();
    audibleAgentUidRef.current = null;
    speakingAgentUidsRef.current.clear();

    setLocalAudioTrack(null);

    localAudioTrackRef.current = null;
    setIsConnected(false);
    setMicState("idle");
    setIsAgentSpeaking(false);
    setIsAgentListening(false);
    setInputVolume(0);
    setMessageList([]);
    setCurrentInProgressMessage(null);
    setAgentTurnFinishedSequence(0);
    setAgentSpeakingStartedSequence(0);
    setLastStartedAgentUid(null);
    setLastFinishedAgentUid(null);
    remoteAudioUidRef.current = null;
  }, []);

  const joinChannel = useCallback(
    async (config: VoiceClientConfig) => {
      // Guard on the REFS, not on isConnected.
      //
      // isConnected is React state and only flips true after a join fully
      // succeeds. If an earlier attempt created the RTM client and then failed
      // partway - or if the state simply has not committed yet - isConnected is
      // still false while rtmClientRef holds a live client. The old check missed
      // that case, so every retry built ANOTHER AgoraRTM.RTM and orphaned the
      // previous one. That is what Agora's "Ins id is 2 / 3 / 4, please pay
      // attention to avoid mutual kick issues" messages are reporting: instances
      // piling up, one per attempt.
      if (isConnected || rtmClientRef.current || rtcClientRef.current || voiceAIRef.current) {
        await leaveChannel();
      }

      try {
        setVoiceError(null);
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
            const uid = String(user.uid);
            const track = user.audioTrack;
            if (!track) return;
            remoteAudioTracksRef.current.set(uid, track);
            if (audibleAgentUidRef.current === uid) {
              track.play();
              remoteAudioUidRef.current = uid;
              setRemoteAudioTrack(track);
            } else {
              track.stop();
            }
          }
        };
        const onUnpublished = (
          user: IAgoraRTCRemoteUser,
          mediaType: "audio" | "video",
        ) => {
          if (mediaType === "audio") {
            const uid = String(user.uid);
            remoteAudioTracksRef.current.delete(uid);
            if (remoteAudioUidRef.current === uid) {
              setIsAgentSpeaking(false);
              setRemoteAudioTrack(null);
              remoteAudioUidRef.current = null;
            }
          }
        };
        const onLeft = (user: IAgoraRTCRemoteUser) => {
          // During a controlled handoff the old specialist can leave after the
          // new one has already published. Never let that late leave event
          // detach the new specialist's audio track.
          const uid = String(user.uid);
          remoteAudioTracksRef.current.delete(uid);
          if (remoteAudioUidRef.current !== uid) return;
          setIsAgentSpeaking(false);
          setRemoteAudioTrack(null);
          remoteAudioUidRef.current = null;
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
          rtmEngine: rtmClient,
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: false,
        });

        // Listen to transcript updates
        voiceAI.on(
          AgoraVoiceAIEvents.TRANSCRIPT_UPDATED,
          (messages: TranscriptItem[]) => {
            const fixSpacing = (t: string) =>
              t.replace(/([.!?,:;])([A-Za-z])/g, "$1 $2");
            const convertedMessages = messages.map((m) => ({
              turn_id: m.turn_id,
              uid: m.uid,
              text: fixSpacing(m.text),
              status: m.status,
              // The toolkit field is `_time`, not `timestamp`. Reading
              // `m.timestamp` returned undefined on every message, so the
              // sort below was comparing 0 - 0 and never reordered anything.
              timestamp: m._time,
              // UID formatting varies between RTC and RTM. The toolkit's
              // metadata.object is the authoritative speaker identity and
              // must survive normalization; dropping it previously made the
              // interview feed agent speech back as candidate answers.
              source: m.metadata?.object === MessageType.USER_TRANSCRIPTION
                ? "candidate" as const
                : m.metadata?.object === MessageType.AGENT_TRANSCRIPTION
                  ? "agent" as const
                  : "unknown" as const,
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
        voiceAI.on(AgoraVoiceAIEvents.AGENT_LISTENING_CHANGED, (_uid, active) => {
          setIsAgentListening(active);
        });
        voiceAI.on(AgoraVoiceAIEvents.AGENT_SPEAKING_CHANGED, (eventUid, active) => {
          const speakingUid = String(eventUid);
          if (active) speakingAgentUidsRef.current.add(speakingUid);
          else speakingAgentUidsRef.current.delete(speakingUid);
          if (speakingUid !== audibleAgentUidRef.current) return;
          setIsAgentSpeaking(active);
          if (active) {
            setLastStartedAgentUid(speakingUid);
            setAgentSpeakingStartedSequence((value) => value + 1);
          } else {
            setLastFinishedAgentUid(speakingUid);
            // Some provider paths emit speaking=false before the richer
            // turn-finished metric event. Either signal may yield the floor;
            // the interview room de-duplicates the sequence.
            setAgentTurnFinishedSequence((value) => value + 1);
          }
        });
        voiceAI.on(AgoraVoiceAIEvents.AGENT_TURN_FINISHED, (eventUid) => {
          const finishedUid = String(eventUid);
          speakingAgentUidsRef.current.delete(finishedUid);
          if (finishedUid !== audibleAgentUidRef.current) return;
          // A monotonic event counter is safer than a boolean: two consecutive
          // agent turns cannot collapse into one React state value.
          setLastFinishedAgentUid(finishedUid);
          setAgentTurnFinishedSequence((value) => value + 1);
          setIsAgentSpeaking(false);
        });
        voiceAI.on(AgoraVoiceAIEvents.AGENT_ERROR, (_uid, error) => {
          const detail = typeof error === "object" ? JSON.stringify(error) : String(error);
          setVoiceError(`Agora voice agent error: ${detail}`);
        });

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
          encoderConfig: "speech_standard",
          AEC: true,
          ANS: true,
          AGC: true,
          ...(config.microphoneId
            ? { microphoneId: config.microphoneId }
            : {}),
        });
        await rtcClient.publish([audioTrack]);
        await audioTrack.setMuted(false);

        // Subscribe to AI messages on the channel
        voiceAI.subscribeMessage(config.channel);

        setLocalAudioTrack(audioTrack);

        localAudioTrackRef.current = audioTrack;
        localVolumeIntervalRef.current = setInterval(() => {
          setInputVolume(audioTrack.getVolumeLevel());
        }, 200);
        setIsConnected(true);
        setMicState("listening");
      } catch (error) {
        console.error("Error joining channel:", error);
        setVoiceError(describeVoiceError(error));
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

  /** Deterministic publication control for state-driven interview flows.
   * Unlike toggleMute, callers can safely request a known state during a phase
   * transition without racing React's previous isMuted value. The microphone
   * device remains open; disabled tracks publish no candidate audio to Ari. */
  const setMicrophoneEnabled = useCallback(async (enabled: boolean) => {
    const track = localAudioTrackRef.current;
    if (!track) return;
    try {
      // Keep capture alive during coding; only pause/resume transmission.
      await track.setMuted(!enabled);
      setIsMuted(!enabled);
      setMicState(enabled ? "listening" : "idle");
    } catch (error) {
      console.error("Error setting microphone state:", error);
      throw error;
    }
  }, []);

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

  const interruptAgent = useCallback(async (targetUid: string) => {
    const voiceAI = voiceAIRef.current;
    if (!voiceAI) return;
    try {
      // Cancel the voice model's autonomous post-ASR response. The backend
      // orchestrator will inject the only permitted acknowledgement/next turn.
      await voiceAI.interrupt(targetUid);
    } catch (error) {
      console.warn("Could not interrupt pending agent speech:", error);
    }
  }, []);

  /**
   * Grants the browser's acoustic floor to exactly one Agora agent.
   *
   * A null UID deliberately silences every remote participant while the
   * candidate is answering, coding, or waiting for backend evaluation. This
   * is a hard playback invariant and does not depend on an LLM following a
   * prompt or an asynchronous interrupt arriving in time.
   */
  const setAudibleAgentUid = useCallback((targetUid: string | null) => {
    const previousUid = audibleAgentUidRef.current;
    audibleAgentUidRef.current = targetUid;
    const alreadySpeaking = Boolean(
      targetUid && speakingAgentUidsRef.current.has(targetUid),
    );
    setIsAgentSpeaking(alreadySpeaking);
    setRemoteAudioTrack(null);
    remoteAudioUidRef.current = null;

    for (const [uid, track] of remoteAudioTracksRef.current.entries()) {
      if (targetUid && uid === targetUid) {
        track.play();
        remoteAudioUidRef.current = uid;
        setRemoteAudioTrack(track);
      } else {
        track.stop();
      }
    }

    // The Agora speaking-start event can arrive just before /sessions/start or
    // /next returns the authoritative UID. Preserve provider state internally
    // and synthesize the UI lease when that already-speaking UID gains floor.
    if (alreadySpeaking && targetUid !== previousUid) {
      setLastStartedAgentUid(targetUid);
      setAgentSpeakingStartedSequence((value) => value + 1);
    }
  }, []);

  return {
    isConnected,
    isMuted,
    micState,
    messageList,
    currentInProgressMessage,
    isAgentSpeaking,
    isAgentListening,
    inputVolume,
    voiceError,
    localAudioTrack,
    joinChannel,
    leaveChannel,
    toggleMute,
    setMicrophoneEnabled,
    sendMessage,
    interruptAgent,
    setAudibleAgentUid,
    agentTurnFinishedSequence,
    agentSpeakingStartedSequence,
    lastStartedAgentUid,
    lastFinishedAgentUid,
    agentUid,
    rtmClientRef,
    remoteUserLeftAt,
  };
}
