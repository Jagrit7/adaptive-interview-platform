'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAgoraVoiceClient } from '@/hooks/useAgoraVoiceClient';
import { useBuilderStore } from '@/store/builderStore';
import { ArenaRoom, type Panelist, type TranscriptLine } from '@/components/arena/ArenaRoom';
import { CandidateForm } from './CandidateForm';
import { saveReport, type InterviewReport } from '@/lib/reports';

const APP_ID = '02bcecea17334c6dad96219c276fbd38';
const BACKEND_URL = 'http://localhost:8000';

export default function InterviewRoomLive() {
  const router = useRouter();
  const { agents, scorer, projectName, language, panelId, activeSpeakerId, setActiveSpeakerId } =
    useBuilderStore();

  // The interview does not begin until the form is submitted, so the report
  // always has a candidate attached. Nothing is started before this is set.
  const [candidate, setCandidate] = useState<{ name: string; ref: string } | null>(null);
  const [reportState, setReportState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [reportError, setReportError] = useState<string | null>(null);
  const reportSavedRef = useRef(false);

  const [channel] = useState(() => `panel-${Date.now()}`);
  // A fresh uid per session, not a hardcoded 1002.
  //
  // Agora RTM rejects a second login with a uid that is already active on the
  // same app ID (-10027). A constant uid made that collision guaranteed in three
  // ordinary situations: two tabs of the app open at once, a fast rejoin before
  // Agora has finished tearing the old session down, and any exit path that
  // skipped leaveChannel. A unique uid removes the collision by construction, so
  // the cleanup below is a courtesy rather than the only thing standing between
  // you and a broken room.
  const [uid] = useState(() => Math.floor(Math.random() * 1_000_000) + 100_000);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // The uid the agent speaks under, straight from /sessions/start. Everything
  // that is not the agent is the candidate - see the note in the turn effect.
  const [agentUid, setAgentUid] = useState<string | null>(null);
  const seenUidsRef = useRef<Set<string>>(new Set());
  const [status, setStatus] = useState('starting...');

  // Arena UI state. None of it reaches the backend yet — the code pane is a
  // scratchpad until the answer payload carries it.
  const [scratch, setScratch] = useState('');
  const [codeLanguage, setCodeLanguage] = useState('Python');
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [questionsTotal, setQuestionsTotal] = useState(0);
  const coding = true;
  const [isFinished, setIsFinished] = useState(false);
  const [processedTurnIds] = useState(() => new Set<string>());

  // How long the candidate must be quiet before their segments count as one
  // finished answer. Long enough to survive a pause mid-sentence, short enough
  // that the agent does not feel slow.
  const ANSWER_SETTLE_MS = 1200;
  const pendingAnswerRef = useRef<string[]>([]);
  const answerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnInFlightRef = useRef(false);

  const { isConnected, messageList, joinChannel, leaveChannel } = useAgoraVoiceClient();

  /**
   * Submits one candidate answer and applies whatever the orchestrator decides.
   *
   * Serialised through turnInFlightRef. The effect below used to call this from
   * inside a for-loop without awaiting, so several answers could be POSTed
   * concurrently; the backend mutates one shared SessionState across await
   * points, so concurrent turns raced each other's scores and queue writes.
   */
  const handleNextTurn = async (answerText: string) => {
    if (!sessionId || isFinished || turnInFlightRef.current) return;
    const text = answerText.trim();
    if (!text) return;                       // never submit an empty turn

    turnInFlightRef.current = true;
    setActiveSpeakerId('user');
    try {
      const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer_text: text }),
      });
      const data = await res.json();
      if (data.current_agent_id) setActiveSpeakerId(data.current_agent_id);
      setIsFinished(data.is_finished);
      setQuestionsAsked(data.questions_asked ?? 0);
      setQuestionsTotal(data.questions_total ?? 0);
      const progress = data.questions_total > 0
        ? ` \u00b7 Q${data.questions_asked}/${data.questions_total}`
        : '';
      setStatus(data.is_finished ? 'Interview finished' : `Listening (${data.action})${progress}`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      turnInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!isConnected || isFinished || !sessionId) return;

    for (const m of messageList) {
      // Identify the candidate as "not the agent", using the uid the backend
      // reported at session start.
      //
      // Two previous attempts both failed, in opposite directions. `!== '0'`
      // matched everything, because uid 0 means "assign me a random uid" and
      // the agent never actually spoke as 0 - so the agent's own questions were
      // posted back as answers and it interviewed itself. Replacing that with
      // `=== String(uid)` matched nothing whenever Agora reported the
      // candidate's transcript uid as anything other than the exact RTC uid
      // string - so no turn ever advanced, no new bank question was ever
      // injected, and the agent sat repeating the last question it was given.
      //
      // The agent's uid is now pinned server-side and returned by
      // /sessions/start, so comparing against it is exact and cannot fail
      // either way.
      const uids = seenUidsRef.current;
      if (!uids.has(String(m.uid))) {
        uids.add(String(m.uid));
        console.info(
          `[interview] transcript uid seen: ${m.uid} ` +
          `(agent=${agentUid}, me=${uid}) -> treated as ` +
          `${String(m.uid) === String(agentUid) ? 'AGENT' : 'CANDIDATE'}`,
        );
      }
      if (agentUid !== null && String(m.uid) === String(agentUid)) {
        // The agent's most recent line is what the arena shows as the question.
        setCurrentQuestion(m.text);
        continue;
      }

      // Key on uid AND turn_id. The agent and the candidate can carry the same
      // turn_id within one exchange, so a turn_id-only key silently dropped
      // real answers.
      const key = `${m.uid}:${m.turn_id}`;
      if (processedTurnIds.has(key)) continue;
      processedTurnIds.add(key);

      pendingAnswerRef.current.push(m.text);
    }

    if (pendingAnswerRef.current.length === 0) return;

    // Speech-to-text splits one spoken answer into several final segments -
    // a pause for breath is enough. Each segment used to fire its own turn, so
    // one answer burned three questions and three visits in a couple of
    // seconds. Wait for the candidate to actually stop, then submit the
    // segments as a single answer.
    if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
    answerTimerRef.current = setTimeout(() => {
      const combined = pendingAnswerRef.current.join(' ').trim();
      pendingAnswerRef.current = [];
      if (combined) void handleNextTurn(combined);
    }, ANSWER_SETTLE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageList, isConnected, isFinished, sessionId, uid, agentUid]);

  // Start the session once, on mount. Guarded against React Strict Mode's
  // deliberate double-invocation in dev - without hasStartedRef, this whole
  // sequence (including the real Agora session.start() call) fires twice,
  // the second collides with the first ("session with same name already
  // exists"), and the first attempt's cleanup can tear down the channel join
  // that only just succeeded on the second attempt - this was the actual
  // cause of "connected but no audio".
  const hasStartedRef = useRef(false);
  const teardownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A remount within the deferral window means Strict Mode, not a real exit.
    if (teardownTimerRef.current) {
      clearTimeout(teardownTimerRef.current);
      teardownTimerRef.current = null;
    }
    if (!candidate) return;          // waiting on the pre-interview form
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

        // JOIN THE CHANNEL BEFORE STARTING THE AGENT.
        //
        // This used to run the other way round, and the ordering matters. The
        // backend starts the agent with remote_uids=[our uid] and then, in
        // knowledge-base mode, immediately injects the first question. If we
        // have not joined yet, the agent greets and asks into an empty channel,
        // and the uid it was told to listen to is not present at the moment it
        // subscribes - so the candidate's audio may never reach it at all. The
        // symptom is the agent repeating its fallback line ("I didn't quite
        // catch that") because, as far as it is concerned, nobody ever speaks.
        setStatus('Joining channel...');
        await joinChannel({ appId: APP_ID, channel, token, uid });


        setStatus('Starting panel session...');
        const startRes = await fetch(`${BACKEND_URL}/sessions/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            panel: { projectName, language, agents, scorer },
            channel,
            remote_uid: String(uid),
            candidate_name: candidate.name,
            candidate_ref: candidate.ref,
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
        setAgentUid(String(startData.agent_uid ?? '1'));
        setActiveSpeakerId(startData.agent_id);

        setStatus('Connected - interview in progress');
      } catch (err) {
        console.error(err);
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    start();

    // Teardown on real unmount, deferred so Strict Mode cannot trigger it.
    //
    // The previous version had NO cleanup at all, for a good reason: in dev,
    // Strict Mode unmounts and immediately remounts, and an eager cleanup tore
    // down the channel join that had only just succeeded. The cost of removing
    // it was that leaving the room by any route other than the Exit button -
    // browser Back, closing the tab, a hot reload - left the RTM session logged
    // in forever, which is what produced -10027 on the next attempt.
    //
    // The fix is to defer rather than skip. Strict Mode remounts within a few
    // milliseconds and the effect body clears the pending timer; a real unmount
    // has nothing to clear it, so teardown runs.
    return () => {
      if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
      teardownTimerRef.current = setTimeout(() => {
        void leaveChannel();
        hasStartedRef.current = false;
      }, 400);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate]);

  // Closing the tab or hard-refreshing never runs React cleanup, so RTM would
  // stay logged in. logout() is async and the page is going away, so this is
  // best-effort - the unique uid above is what actually guarantees the next
  // session still works.
  useEffect(() => {
    const onUnload = () => { void leaveChannel(); };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Pulls the report from the backend and stores it in Supabase.
   *
   * Called both when the interview finishes naturally and when the candidate
   * exits early - an abandoned interview still produced measurements, and the
   * report records `completed: false` rather than pretending otherwise.
   *
   * reportSavedRef stops the two paths racing; the upsert on session_id is the
   * second line of defence if they do.
   */
  const persistReport = async () => {
    if (!sessionId || reportSavedRef.current) return;
    reportSavedRef.current = true;
    setReportState('saving');
    setReportError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/report`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.detail === 'string' ? body.detail : 'Could not build the report.',
        );
      }
      const report: InterviewReport = await res.json();
      await saveReport(report, panelId);
      setReportState('saved');
    } catch (err) {
      // Let it be retried - a failed save should not be permanent.
      reportSavedRef.current = false;
      setReportState('error');
      setReportError(err instanceof Error ? err.message : String(err));
    }
  };

  // Save as soon as the backend says the interview is over, rather than waiting
  // for the user to click Exit. The session lives in the backend's memory and is
  // lost on restart, so the window to capture it is now.
  useEffect(() => {
    if (isFinished) void persistReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinished]);

  const handleClose = async () => {
    await persistReport();
    await leaveChannel();
    setActiveSpeakerId(null);
    router.push('/builder');
  };

  // Checked before the form, not after the session-start request fails. The
  // backend rejects an opener-less panel with a 400, but by then the candidate
  // has already typed their name and is looking at a red stack trace.
  const hasOpener = agents.some((a) => a.turnTaking.canOpen);

  if (agents.length === 0 || !hasOpener) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '24px',
      }}>
        <div style={{
          width: '100%', maxWidth: '440px', padding: '32px',
          border: '1px solid var(--accent-amber)', borderRadius: '12px',
          backgroundColor: 'var(--surface)',
        }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 10px' }}>
            This panel can&apos;t start yet
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
            {agents.length === 0
              ? 'There are no interviewers in this panel. Add at least one before starting.'
              : 'No interviewer is set to open the interview, so nobody would speak first. ' +
                'Open any agent, go to the Turn-taking & Scoring step, and switch on ' +
                '"Can open the interview".'}
          </p>
          <button
            onClick={() => router.push('/builder')}
            style={{
              width: '100%', padding: '11px', borderRadius: '8px', border: 'none',
              fontWeight: 500, fontSize: '14px', cursor: 'pointer',
              backgroundColor: 'var(--text-primary)', color: 'var(--bg)',
            }}
          >
            Back to the builder
          </button>
        </div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <CandidateForm
        panelName={projectName}
        agentCount={agents.length}
        onStart={setCandidate}
        onCancel={() => router.push('/builder')}
      />
    );
  }

  // ---- map session state onto the arena's presentational props ----

  const panelists: Panelist[] = agents.map((a) => ({
    id: a.id,
    name: a.identity.name,
    role: a.identity.role,
    speaking: activeSpeakerId === a.id,
  }));

  // messageList is the toolkit's live transcript. Agent lines are anything
  // that is not us — the same rule the turn effect uses.
  const arenaTranscript: TranscriptLine[] = messageList.map((m, i) => {
    const mine = String(m.uid) === String(uid);
    return {
      id: `${m.uid}:${m.turn_id}:${i}`,
      who: mine ? ('candidate' as const) : ('agent' as const),
      name: mine
        ? 'You'
        : agents.find((a) => a.id === activeSpeakerId)?.identity.name ?? 'Interviewer',
      text: m.text,
    };
  });

  const currentAgent = agents.find((a) => a.id === activeSpeakerId);

  return (
    <ArenaRoom
      roundName={currentAgent ? `${currentAgent.identity.role} round` : projectName || 'Interview'}
      elapsed={status}
      questionNumber={questionsAsked || 1}
      questionTotal={questionsTotal || agents.length}
      question={currentQuestion || 'Listen for the first question.'}
      panelists={panelists}
      transcript={arenaTranscript}
      agentState={isFinished ? 'listening' : 'listening'}
      code={scratch}
      onCodeChange={setScratch}
      language={codeLanguage}
      onLanguageChange={setCodeLanguage}
      micOn={micOn}
      onToggleMic={() => setMicOn((v) => !v)}
      cameraOn={cameraOn}
      onToggleCamera={() => setCameraOn((v) => !v)}
      onEnd={handleClose}
      coding={coding}
    />
  );
}
