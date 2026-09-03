'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAgoraVoiceClient } from '@/hooks/useAgoraVoiceClient';
import { useBuilderStore, type Agent } from '@/store/builderStore';
import { ArenaRoom, type Panelist } from '@/components/arena/ArenaRoom';
import { CandidateForm } from './CandidateForm';
import { saveReport, type InterviewReport } from '@/lib/reports';
import type { PanelConfig } from '@/lib/panels';

const APP_ID = '02bcecea17334c6dad96219c276fbd38';
const BACKEND_URL = 'http://localhost:8000';

type WrittenQuestion = {
  id: string;
  prompt: string;
  tags: string[];
  difficulty: number | null;
  kind: 'coding' | 'written' | 'verbal';
  title?: string | null;
  starter_code?: string | null;
  constraints?: string[];
  test_cases?: Array<{ id: string; label: string; input_display: string; expected_display: string }>;
};

type Awaiting = 'agent' | 'candidate' | 'workspace' | 'evaluation' | 'finished';

type TurnResponse = {
  action: 'follow_up' | 'switch_agent' | 'end_visit' | 'finished';
  current_agent_id: string | null;
  is_finished: boolean;
  coverage?: number | null;
  missing_points?: string[];
  questions_asked: number;
  questions_total: number;
  current_question: WrittenQuestion | null;
  question_status: 'pending' | 'retry' | 'correct' | 'answered' | 'skipped' | 'none';
  answer_correct: boolean;
  question_score?: number | null;
  awaiting: Awaiting;
  question_revision: number;
  agent_uid?: string | null;
  voice_id?: string | null;
};

export type PublishedPanelView = {
  projectName: string;
  language: string;
  role: string;
  agents: Array<Pick<Agent, 'id' | 'identity' | 'turnTaking'>>;
};

export default function InterviewRoomLive({
  panelOverride,
  publishedPanel,
  publishedAccess,
  overridePanelId,
  exitHref = '/builder',
  testMode = false,
}: {
  panelOverride?: PanelConfig;
  publishedPanel?: PublishedPanelView;
  publishedAccess?: { panelId: string; invite: string };
  overridePanelId?: string;
  exitHref?: string;
  testMode?: boolean;
} = {}) {
  const router = useRouter();
  const storedPanel = useBuilderStore();
  const agents = publishedPanel?.agents ?? panelOverride?.agents ?? storedPanel.agents;
  const scorer = panelOverride?.scorer ?? storedPanel.scorer;
  const projectName = publishedPanel?.projectName ?? panelOverride?.projectName ?? storedPanel.projectName;
  const language = publishedPanel?.language ?? panelOverride?.language ?? storedPanel.language;
  const panelId = publishedAccess?.panelId ?? overridePanelId ?? storedPanel.panelId;
  const { activeSpeakerId, setActiveSpeakerId } = storedPanel;

  // The interview does not begin until the form is submitted, so the report
  // always has a candidate attached. Nothing is started before this is set.
  const [candidate, setCandidate] = useState<{ name: string; ref: string } | null>(null);
  const [, setReportState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [, setReportError] = useState<string | null>(null);
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
  const [cameraOn, setCameraOn] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [writtenQuestion, setWrittenQuestion] = useState<WrittenQuestion | null>(null);
  // The backend can select the next question before Agora has begun saying it.
  // Keep that authoritative question separate from the one rendered on screen,
  // then reveal it on the matching agent-speaking event.
  const [visibleQuestion, setVisibleQuestion] = useState<WrittenQuestion | null>(null);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [questionsTotal, setQuestionsTotal] = useState(0);
  const coding = writtenQuestion?.kind === 'coding';
  const [runSummary, setRunSummary] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Array<{id:string;label:string;input?:string;expected?:string;actual?:string|null;passed:boolean;error?:string|null}>>([]);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [awaiting, setAwaiting] = useState<Awaiting>('agent');
  const [questionRevision, setQuestionRevision] = useState(0);
  const [processedTurnIds] = useState(() => new Set<string>());

  // How long the candidate must be quiet before their segments count as one
  // finished answer. Long enough to survive a pause mid-sentence, short enough
  // that the agent does not feel slow.
  // Agora semantic endpointing already decides when a thought is complete.
  // This small window only coalesces adjacent final transcript packets; it is
  // not a second end-of-speech detector.
  const ANSWER_SETTLE_MS = 350;
  const pendingAnswerRef = useRef<string[]>([]);
  const pendingAnswerIdsRef = useRef<string[]>([]);
  const answerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnInFlightRef = useRef(false);
  const echoGuardUntilRef = useRef(0);
  const acceptingVoiceRef = useRef(false);
  const questionRevisionRef = useRef(0);
  const agentUidRef = useRef<string | null>(null);
  const handledAgentTurnRef = useRef(0);
  const pendingVisualQuestionRef = useRef<WrittenQuestion | null>(null);
  const activeQuestionIdRef = useRef<string | null>(null);

  const {
    isConnected,
    messageList,
    joinChannel,
    leaveChannel,
    isAgentSpeaking,
    setMicrophoneEnabled,
    interruptAgent,
    agentSpeakingStartedSequence,
    agentTurnFinishedSequence,
  } = useAgoraVoiceClient();

  useEffect(() => {
    // Half-duplex transcript guard: while remote agent audio is playing, and
    // for a short acoustic tail afterwards, USER_TRANSCRIPTION can only be a
    // loudspeaker echo. A real answer is expected after the question ends.
    echoGuardUntilRef.current = isAgentSpeaking ? Number.POSITIVE_INFINITY : Date.now() + 900;
  }, [isAgentSpeaking]);

  const applyTurn = (data: TurnResponse) => {
    if (data.current_agent_id) setActiveSpeakerId(data.current_agent_id);
    if (data.agent_uid) {
      setAgentUid(data.agent_uid);
      agentUidRef.current = data.agent_uid;
    }
    setIsFinished(data.is_finished);
    setQuestionsAsked(data.questions_asked ?? 0);
    setQuestionsTotal(data.questions_total ?? 0);
    setAwaiting(data.awaiting);
    setQuestionRevision(data.question_revision);
    questionRevisionRef.current = data.question_revision;
    acceptingVoiceRef.current = data.awaiting === 'candidate';
    const next = data.current_question ?? null;
    const isNewQuestion = next?.id !== activeQuestionIdRef.current;
    activeQuestionIdRef.current = next?.id ?? null;
    setWrittenQuestion(next);
    if (data.awaiting === 'agent') {
      pendingVisualQuestionRef.current = next;
    } else {
      pendingVisualQuestionRef.current = null;
      setVisibleQuestion(next);
      setCurrentQuestion(next?.prompt ?? (data.is_finished ? 'Interview complete.' : 'Listen for the next question.'));
    }
    // candidate-ready returns the same question after the spoken introduction;
    // do not erase work or results when only the speaking floor changes.
    if (isNewQuestion) {
      setScratch(next?.starter_code ?? '');
      setRunSummary(null);
      setRunResults([]);
    }
    const progress = data.questions_total > 0 ? ` · Q${data.questions_asked}/${data.questions_total}` : '';
    setStatus(data.is_finished ? 'Interview finished' : data.question_status === 'skipped' ? `Question skipped · score 0%${progress}` : data.question_score != null ? `Answer recorded · score ${Math.round(data.question_score * 100)}%${progress}` : `${data.awaiting === 'agent' ? 'Interviewer speaking' : data.awaiting === 'workspace' ? 'Work on the question' : 'Your turn'}${progress}`);
  };

  useEffect(() => {
    if (!agentSpeakingStartedSequence) return;
    const next = pendingVisualQuestionRef.current;
    if (!next) return;
    pendingVisualQuestionRef.current = null;
    setVisibleQuestion(next);
    setCurrentQuestion(next.prompt);
  }, [agentSpeakingStartedSequence, sessionId]);

  /**
   * Submits one candidate answer and applies whatever the orchestrator decides.
   *
   * Serialised through turnInFlightRef. The effect below used to call this from
   * inside a for-loop without awaiting, so several answers could be POSTed
   * concurrently; the backend mutates one shared SessionState across await
   * points, so concurrent turns raced each other's scores and queue writes.
   */
  const handleNextTurn = async (answerText: string, answerId?: string) => {
    if (!sessionId || isFinished || turnInFlightRef.current) return;
    const text = answerText.trim();
    if (!text) return;                       // never submit an empty turn

    turnInFlightRef.current = true;
    acceptingVoiceRef.current = false;
    setAwaiting('evaluation');
    await setMicrophoneEnabled(false);
    setMicOn(false);
    if (agentUidRef.current) await interruptAgent(agentUidRef.current);
    setActiveSpeakerId('user');
    try {
      const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer_text: text,
          question_id: writtenQuestion?.id ?? null,
          question_revision: questionRevisionRef.current,
          answer_id: answerId,
        }),
      });
      const data = await res.json() as TurnResponse & { detail?: string };
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not submit this answer');
      applyTurn(data);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      const restored: Awaiting = writtenQuestion?.kind && writtenQuestion.kind !== 'verbal' ? 'workspace' : 'candidate';
      setAwaiting(restored);
      acceptingVoiceRef.current = restored === 'candidate';
      await setMicrophoneEnabled(restored === 'candidate');
      setMicOn(restored === 'candidate');
    } finally {
      turnInFlightRef.current = false;
    }
  };

  const runCode = async (submit: boolean) => {
    if (!sessionId || !coding || workspaceBusy) return;
    if (codeLanguage !== 'Python') {
      setRunSummary(`${codeLanguage} execution is not configured on this server yet. Choose Python to run tests.`);
      return;
    }
    setWorkspaceBusy(true);
    try {
      const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/${submit ? 'submit-code' : 'run-code'}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:scratch,language:'python',question_id:writtenQuestion?.id,question_revision:questionRevisionRef.current,answer_id:submit?`${writtenQuestion?.id}:${questionRevisionRef.current}:code`:undefined})});
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Code execution failed');
      const result = submit ? data.test_run : data;
      setRunSummary(`${result.passed}/${result.total} tests passed${result.runtime_error ? ` · ${result.runtime_error}` : ''}`);
      setRunResults(result.results ?? []);
      if (submit) applyTurn(data.turn);
    } catch (error) { setRunSummary(error instanceof Error ? error.message : String(error)); }
    finally { setWorkspaceBusy(false); }
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
          `${m.source.toUpperCase()}`,
        );
      }
      if (m.source === 'agent' || (m.source === 'unknown' && agentUid !== null && String(m.uid) === String(agentUid))) {
        // The printed question is backend-owned. Agent transcripts are useful
        // for diagnostics but never replace or advance the authoritative UI.
        continue;
      }

      // Never promote an unidentified transcript to candidate speech. Agora
      // gives us an explicit transcription object type; uncertainty must fail
      // closed or the agent can interview its own output indefinitely.
      if (m.source !== 'candidate') continue;
      if (!acceptingVoiceRef.current || awaiting !== 'candidate') continue;

      // Agora may begin preparing an automatic LLM response as soon as its VAD
      // finalises a segment. Cancel that response immediately; the orchestrator
      // will provide the only acknowledgement after the complete answer settles.
      if (agentUidRef.current) void interruptAgent(agentUidRef.current);

      if (Date.now() < echoGuardUntilRef.current) {
        console.info(`[interview] ignored probable playback echo for turn ${m.turn_id}`);
        continue;
      }

      // Key on uid AND turn_id. The agent and the candidate can carry the same
      // turn_id within one exchange, so a turn_id-only key silently dropped
      // real answers.
      const key = `${m.uid}:${m.turn_id}`;
      if (processedTurnIds.has(key)) continue;
      processedTurnIds.add(key);

      // During a written task, ordinary speech must not accidentally submit
      // the pad. An explicit pass still works by voice.
      const explicitPass = /\b(?:i\s+(?:do\s*not|don't|dont)\s+know|no\s+(?:idea|clue)|skip|move\s+on|i\s+(?:can't|cannot|cant)\s+(?:answer|solve))\b/i.test(m.text);
      if (writtenQuestion && writtenQuestion.kind !== 'verbal' && !explicitPass) continue;
      pendingAnswerRef.current.push(m.text);
      pendingAnswerIdsRef.current.push(key);
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
      const answerId = `${questionRevisionRef.current}:${pendingAnswerIdsRef.current.join(',')}`;
      pendingAnswerRef.current = [];
      pendingAnswerIdsRef.current = [];
      if (combined) void handleNextTurn(combined, answerId);
    }, ANSWER_SETTLE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageList, isConnected, isFinished, sessionId, uid, agentUid, writtenQuestion, awaiting]);

  useEffect(() => {
    if (!agentTurnFinishedSequence || !sessionId || isFinished || questionRevisionRef.current === 0) return;
    if (agentTurnFinishedSequence === handledAgentTurnRef.current) return;
    if (awaiting !== 'agent') {
      // Consume an interrupted autonomous-response event while evaluation is
      // running. It must not be reused to open the next question's floor.
      handledAgentTurnRef.current = agentTurnFinishedSequence;
      return;
    }
    handledAgentTurnRef.current = agentTurnFinishedSequence;
    const yieldFloor = async () => {
      const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}/candidate-ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_revision: questionRevisionRef.current }),
      });
      const data = await response.json() as TurnResponse & { detail?: string };
      if (!response.ok) {
        // A stale finish event from the specialist being replaced is expected
        // at a handoff; the revision check ensures it cannot open the floor.
        if (response.status !== 409) setStatus(`Error: ${data.detail ?? 'Could not yield the floor'}`);
        return;
      }
      applyTurn(data);
      if (data.awaiting === 'candidate') {
        await setMicrophoneEnabled(true);
        setMicOn(true);
        setActiveSpeakerId('user');
      } else {
        await setMicrophoneEnabled(false);
        setMicOn(false);
      }
    };
    void yieldFloor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentTurnFinishedSequence, sessionId, isFinished, awaiting]);

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
        await setMicrophoneEnabled(false);
        setMicOn(false);


        setStatus('Starting panel session...');
        const startRes = await fetch(publishedAccess
          ? `${BACKEND_URL}/published-panels/${encodeURIComponent(publishedAccess.panelId)}/sessions/start`
          : `${BACKEND_URL}/sessions/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(publishedAccess ? {
            invite: publishedAccess.invite,
            channel,
            remote_uid: String(uid),
            candidate_name: candidate.name,
            candidate_ref: candidate.ref,
          } : {
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
        agentUidRef.current = String(startData.agent_uid ?? '1');
        setActiveSpeakerId(startData.agent_id);
        const firstQuestion = startData.current_question ?? null;
        setWrittenQuestion(firstQuestion);
        activeQuestionIdRef.current = firstQuestion?.id ?? null;
        setScratch(firstQuestion?.starter_code ?? '');
        setQuestionsAsked(startData.questions_asked ?? 0);
        setQuestionsTotal(startData.questions_total ?? 0);
        setAwaiting(startData.awaiting ?? 'agent');
        setQuestionRevision(startData.question_revision ?? 0);
        questionRevisionRef.current = startData.question_revision ?? 0;
        if (isAgentSpeaking) {
          setVisibleQuestion(firstQuestion);
          setCurrentQuestion(firstQuestion?.prompt ?? 'Listen for the first question.');
        } else {
          pendingVisualQuestionRef.current = firstQuestion;
          setCurrentQuestion('Listen for the first question.');
        }

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
      if (!testMode) await saveReport(report, panelId, publishedPanel?.role ?? panelOverride?.enterprise?.role);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isFinished) void persistReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinished]);

  const handleClose = async () => {
    await persistReport();
    await leaveChannel();
    setActiveSpeakerId(null);
    router.push(exitHref);
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
            onClick={() => router.push(exitHref)}
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
        onCancel={() => router.push(exitHref)}
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

  const currentAgent = agents.find((a) => a.id === activeSpeakerId);

  return (
    <ArenaRoom
      roundName={currentAgent ? `${currentAgent.identity.role} round` : projectName || 'Interview'}
      elapsed={status}
      questionNumber={questionsAsked || 1}
      questionTotal={questionsTotal || agents.length}
      question={currentQuestion || 'Listen for the first question.'}
      questionDetails={visibleQuestion ?? undefined}
      panelists={panelists}
      agentState={awaiting === 'agent' ? 'speaking' : awaiting === 'evaluation' ? 'thinking' : 'listening'}
      code={scratch}
      onCodeChange={setScratch}
      language={codeLanguage}
      onLanguageChange={setCodeLanguage}
      micOn={micOn}
      onToggleMic={() => {
        const next = !micOn;
        if (awaiting !== 'candidate' && next) return;
        setMicOn(next);
        void setMicrophoneEnabled(next);
      }}
      cameraOn={cameraOn}
      onToggleCamera={() => setCameraOn((v) => !v)}
      onEnd={handleClose}
      coding={coding}
      workspaceVisible={awaiting === 'workspace'}
      onRunCode={() => void runCode(false)}
      onSubmitCode={() => void runCode(true)}
      onSubmitWritten={() => void handleNextTurn(scratch, `${writtenQuestion?.id}:${questionRevision}:written`)}
      onGiveUp={() => void handleNextTurn("I don't know; please move on.", `${writtenQuestion?.id}:${questionRevision}:gave-up`)}
      runSummary={runSummary}
      runResults={runResults}
      isRunning={workspaceBusy}
    />
  );
}
