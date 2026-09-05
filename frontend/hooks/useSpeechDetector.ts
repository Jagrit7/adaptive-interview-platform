'use client';

/**
 * Local voice-activity detection, for barge-in.
 *
 * Silero VAD (v5) running in an AudioWorklet, reporting speech probability
 * roughly every 32ms. This exists for one reason the server cannot cover: the
 * client used to learn that the candidate had started talking only when a
 * transcript segment arrived, which is a full speech-to-text round trip later.
 * By then the interviewer had been talking over them for about a second.
 *
 * It does not transcribe and it does not decide what was said - Agora's ASR
 * and its semantic endpointing still own that. This answers exactly one
 * question, immediately: is a human speaking into the microphone right now.
 *
 * It reuses the microphone track Agora already publishes instead of opening a
 * second capture, so there is one set of AEC/ANS/AGC filters and one device in
 * use. That matters here: with echo cancellation applied upstream, the agent's
 * own voice coming out of the speakers does not register as the candidate
 * speaking, which is what would otherwise make barge-in fire against itself.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

type Detector = { pause: () => void; destroy: () => void };

export interface SpeechDetectorOptions {
  /** Agora's published microphone track. Null until the channel is joined. */
  track: MediaStreamTrack | null;
  /** Fired once each time sustained speech begins. */
  onSpeechStart?: () => void;
  /** Suppress detection (e.g. while the microphone is deliberately muted). */
  enabled?: boolean;
}

export function useSpeechDetector({ track, onSpeechStart, enabled = true }: SpeechDetectorOptions) {
  const [speaking, setSpeaking] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held in a ref so changing the handler cannot tear down and reload the
  // model, which costs a fetch and a worklet restart.
  const onSpeechStartRef = useRef(onSpeechStart);
  const enabledRef = useRef(enabled);
  useEffect(() => { onSpeechStartRef.current = onSpeechStart; }, [onSpeechStart]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const speakingRef = useRef(false);
  const setSpeakingSafe = useCallback((value: boolean) => {
    if (speakingRef.current === value) return;
    speakingRef.current = value;
    setSpeaking(value);
  }, []);

  useEffect(() => {
    if (!track) return;
    let detector: Detector | null = null;
    let cancelled = false;

    void (async () => {
      try {
        // Imported here rather than at module scope: it pulls in the ONNX
        // runtime and an AudioWorklet, neither of which exists during the
        // server render of this page.
        const { MicVAD } = await import('@ricky0123/vad-web');
        const vad = await MicVAD.new({
          model: 'v5',
          baseAssetPath: '/vad/',
          onnxWASMBasePath: '/vad/',
          // Reuse Agora's already-filtered microphone rather than opening a
          // second one.
          getStream: async () => new MediaStream([track]),
          pauseStream: async () => {},
          resumeStream: async () => new MediaStream([track]),
          startOnLoad: false,
          // Deliberately conservative. A false positive here interrupts a
          // question mid-sentence, which is far more disruptive than reacting
          // a fraction of a second late.
          positiveSpeechThreshold: 0.6,
          negativeSpeechThreshold: 0.4,
          // A quarter second of real speech before the floor moves, so a
          // cough or a keyboard cannot take it. This is also what keeps
          // barge-in from firing on the interviewer's own voice leaking past
          // echo cancellation, which is brief rather than sustained.
          minSpeechMs: 250,
          // Ride through the natural gaps inside a sentence rather than
          // calling speech finished at every pause between words.
          redemptionMs: 400,
          preSpeechPadMs: 200,
          onSpeechRealStart: () => {
            if (!enabledRef.current) return;
            setSpeakingSafe(true);
            onSpeechStartRef.current?.();
          },
          onSpeechEnd: () => setSpeakingSafe(false),
          onVADMisfire: () => setSpeakingSafe(false),
        });
        if (cancelled) { vad.destroy(); return; }
        await vad.start();
        detector = vad;
        setReady(true);
        setError(null);
      } catch (err) {
        // A VAD failure must not take the interview down with it. Without it
        // barge-in simply does not fire and everything else behaves as before,
        // so this is reported and swallowed rather than thrown.
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[vad] speech detection unavailable, barge-in disabled: ${message}`);
        if (!cancelled) { setError(message); setReady(false); }
      }
    })();

    return () => {
      cancelled = true;
      setReady(false);
      setSpeakingSafe(false);
      try { detector?.destroy(); } catch { /* already torn down with the track */ }
    };
  }, [track, setSpeakingSafe]);

  return { speaking, ready, error };
}
