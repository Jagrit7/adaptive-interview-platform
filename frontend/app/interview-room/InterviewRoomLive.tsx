'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAgoraVoiceClient } from '@/hooks/useAgoraVoiceClient';
import { useBuilderStore } from '@/store/builderStore';
import { InterviewRoomWindow } from '@/app/builder/InterviewRoomWindow';

const APP_ID = '02bcecea17334c6dad96219c276fbd38';
const BACKEND_URL = 'http://localhost:8000';

export default function InterviewRoomLive() {
  const router = useRouter();
  const { agents, scorer, projectName, activeSpeakerId, setActiveSpeakerId } = useBuilderStore();

  const [channel] = useState(() => `panel-${Date.now()}`);
  const [uid] = useState(1002);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState('starting...');
  const [isFinished, setIsFinished] = useState(false);
  const [processedTurnIds] = useState(() => new Set<number>());

  const { isConnected, messageList, joinChannel, leaveChannel } = useAgoraVoiceClient();

  const handleNextTurn = async (answerText: string) => {
    if (!sessionId || isFinished) return;
    setActiveSpeakerId('user'); // brief moment showing the candidate as the active speaker
    const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer_text: answerText }),
    });
    const data = await res.json();
    if (data.current_agent_id) setActiveSpeakerId(data.current_agent_id);
    setIsFinished(data.is_finished);
    setStatus(data.is_finished ? 'Interview finished' : `Listening (${data.action})`);
  };

  useEffect(() => {
    if (!isConnected || isFinished || !sessionId) return;
    for (const m of messageList) {
      const isCandidate = m.uid !== '0';
      if (isCandidate && !processedTurnIds.has(m.turn_id)) {
        processedTurnIds.add(m.turn_id);
        handleNextTurn(m.text);
      }
    }
  }, [messageList, isConnected, isFinished, sessionId]);

  // Start the session once, on mount. Guarded against React Strict Mode's
  // deliberate double-invocation in dev - without hasStartedRef, this whole
  // sequence (including the real Agora session.start() call) fires twice,
  // the second collides with the first ("session with same name already
  // exists"), and the first attempt's cleanup can tear down the channel join
  // that only just succeeded on the second attempt - this was the actual
  // cause of "connected but no audio".
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const start = async () => {
      try {
        if (agents.length === 0) {
          setStatus('No agents configured - go back and add one.');
          return;
        }

        setStatus('Fetching token...');
        const tokenRes = await fetch(`${BACKEND_URL}/token?channel=${channel}&uid=${uid}`);
        const { token } = await tokenRes.json();

        setStatus('Starting panel session...');
        const startRes = await fetch(`${BACKEND_URL}/sessions/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            panel: { projectName, agents, scorer },
            channel,
            remote_uid: String(uid),
          }),
        });
        const startData = await startRes.json();
        if (!startRes.ok) {
          const detail =
            typeof startData.detail === 'string'
              ? startData.detail
              : JSON.stringify(startData.detail);
          throw new Error(detail ?? 'Failed to start session');
        }

        setSessionId(startData.session_id);
        setActiveSpeakerId(startData.agent_id);

        setStatus('Joining channel...');
        await joinChannel({ appId: APP_ID, channel, token, uid });

        setStatus('Connected - interview in progress');
      } catch (err) {
        console.error(err);
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    start();
    // No cleanup here on purpose - hasStartedRef already guarantees this
    // effect's real work runs exactly once. A `cancelled` flag set by
    // Strict Mode's fake unmount was previously causing this async function
    // to silently bail out AFTER the real backend call had already
    // succeeded, right before updating status to "Joining channel..." -
    // that was the actual cause of the frozen "Starting panel session..."
    // status even though the backend logs showed a clean 200 OK.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = async () => {
    await leaveChannel();
    setActiveSpeakerId(null);
    router.push('/builder');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
      }}
    >
      <InterviewRoomWindow
        agents={agents}
        activeSpeakerId={activeSpeakerId}
        onClose={handleClose}
        closeLabel="Exit"
        title="Live Interview Room"
      />
      <p style={{ color: '#fff', opacity: 0.7, fontSize: '14px' }}>{status}</p>
    </div>
  );
}
