'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAgoraVoiceClient } from '@/hooks/useAgoraVoiceClient';
import { useSpeechDetector } from '@/hooks/useSpeechDetector';
import { useBuilderStore, type Agent } from '@/store/builderStore';
import { ArenaRoom, type Panelist } from '@/components/arena/ArenaRoom';
import { CandidateForm } from './CandidateForm';
import {
  finalizeInvitedReport,
  saveReport,
  toReportRecord,
  type InterviewReport,
  type ReportRecord,
} from '@/lib/reports';
import { InterviewReportView } from '@/components/reports/InterviewReportView';
import { supabase } from '@/lib/supabaseClient';
import { awardInterviewXp, beginInterview } from '@/lib/gamification';
import type { PanelConfig } from '@/lib/panels';

const APP_ID = '02bcecea17334c6dad96219c276fbd38';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const STALL_NOTICE_MS = 90_000;
// A verbal question left unanswered gets a gentle check-in, and only if the
// silence continues, the question again. A real interviewer does neither
// instantly and neither never; sitting in silence is what made the room feel
// dead, and re-asking on the first pause talks over someone who is thinking.
//
// Each stage waits this long, so the re-ask lands after roughly twenty seconds
// of the CANDIDATE being quiet. The gap is measured per stage rather than from
// one absolute start because the check-in itself is spoken by the interviewer,
// and the candidate is not being silent while someone else is talking.
const SILENCE_NUDGE_MS = 10_000;

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
  /** Seconds allowed on this task; null for untimed verbal questions. */
  time_limit_seconds?: number | null;
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
  assessment_satisfaction?: number | null;
  awaiting: Awaiting;
  question_revision: number;
  agent_uid?: string | null;
  voice_id?: string | null;
  breaks_remaining?: number | null;
  break_seconds_remaining?: number;
  agent_uids?: Record<string, string>;
  host_agent_id?: string;
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
  invitationAccess,
  overridePanelId,
  exitHref = '/builder',
  testMode = false,
}: {
  panelOverride?: PanelConfig;
  publishedPanel?: PublishedPanelView;
  /** Present only for an invited candidate. The token is their credential and
   *  the email is the address it was issued to; the backend re-checks both on
   *  every call, so nothing here is trusted client-side. */
  invitationAccess?: { token: string; email: string; candidateName: string };
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
  const panelId = overridePanelId ?? storedPanel.panelId;
  const { activeSpeakerId, setActiveSpeakerId } = storedPanel;

  // The interview does not begin until the form is submitted, so the report
  // always has a candidate attached. Nothing is started before this is set.
  const [candidate, setCandidate] = useState<{ name: string; ref: string } | null>(null);
  const [reportState, setReportState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [reportError, setReportError] = useState<string | null>(null);
  // The finished report, rendered in place of the room. In a test run this
  // state is the only copy that exists anywhere - nothing is written to
  // Supabase, localStorage or sessionStorage, so closing the window discards it.
  const [reportRecord, setReportRecord] = useState<ReportRecord | null>(null);
  const [xpAward, setXpAward] = useState<{ xp: number; level?: number; trophies?: string[] } | null>(null);
  const reportRecordRef = useRef<ReportRecord | null>(null);
  const reportSavedRef = useRef(false);
  const finalizeInFlightRef = useRef<Promise<void> | null>(null);

  const [channel] = useState(() => `panel-${crypto.randomUUID()}`);
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
  // Mirrored into a ref because the pagehide handler is registered once with an
  // empty dependency list, so it would otherwise close over the initial null
  // and never send the beacon.
  const sessionIdRef = useRef<string | null>(null);
  // The uid the agent speaks under, straight from /sessions/start. Everything
  // that is not the agent is the candidate - see the note in the turn effect.
  const [agentUid, setAgentUid] = useState<string | null>(null);
  const [hostAgentId, setHostAgentId] = useState('__host__');
  const seenUidsRef = useRef<Set<string>>(new Set());
  const [status, setStatus] = useState('starting...');

  // Arena UI state. None of it reaches the backend yet — the code pane is a
  // scratchpad until the answer payload carries it.
  const [scratch, setScratch] = useState('');
  const [breaksRemaining, setBreaksRemaining] = useState<number | null>(null);
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null);
  const [breakTimeLeft, setBreakTimeLeft] = useState<string | null>(null);
  // Read by the task clock, which must not tick while the interview is paused.
  const breakEndsAtRef = useRef<number | null>(null);
  // Latches the automatic end so a pending request is not re-sent every tick.
  const breakEndingRef = useRef(false);
  // Escalation state for the silence prompts, tracked per question.
  const silenceStageRef = useRef<{ questionId: string | null; stage: number }>(
    { questionId: null, stage: 0 },
  );
  // The pad's current contents, readable from a timer without making the
  // countdown a dependency of every keystroke. Written only from the places
  // that change the pad, never from an effect.
  const scratchRef = useRef('');
  const writeScratch = (next: string) => { scratchRef.current = next; setScratch(next); };
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
  // Agora can finalize a transcript segment during an ordinary thinking pause.
  // Do not equate that packet boundary with "answer complete": require a
  // sustained period of locally measured silence before submitting the joined
  // answer to the orchestrator.
  const ANSWER_SILENCE_MS = 2800;
  // Applies only once speech-to-text has marked every buffered turn final.
  const FINAL_TURN_GRACE_MS = 400;
  const SPEAKING_VOLUME_THRESHOLD = 0.025;
  // Keyed by `uid:turn_id`, in arrival order, holding the LATEST text for each
  // turn. Speech-to-text re-emits a turn as it grows, so an append-only list
  // plus a "seen this key" guard kept the FIRST fragment of every turn and
  // discarded the rest - which is what truncated answers to "I'm" or "No.".
  // Replacing by key keeps the fullest version and stays correct even if the
  // final-flag never arrives.
  const pendingAnswerRef = useRef<Map<string, { text: string; complete: boolean }>>(new Map());
  const answerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerQuietSinceRef = useRef(0);
  const inputVolumeRef = useRef(0);
  const turnInFlightRef = useRef(false);
  const echoGuardUntilRef = useRef(0);
  // Guards against a burst of speech-start events queueing several floor
  // transfers for the same interruption.
  const bargeInFlightRef = useRef(false);
  // `awaiting` as a ref, because the detector callback is created once and
  // would otherwise capture a stale phase.
  const awaitingRef = useRef<Awaiting>('agent');
  const acceptingVoiceRef = useRef(false);
  const questionRevisionRef = useRef(0);
  const agentUidRef = useRef<string | null>(null);
  const hostUidRef = useRef<string | null>(null);
  const handledAgentTurnRef = useRef(0);
  // A finish event is valid only after the CURRENT revision emitted a matching
  // speaking-start. Interrupting an older turn can emit a late finish event;
  // without this lease that stale event yields the floor and cuts off the new
  // host question halfway through.
  const activeSpeechRevisionRef = useRef(0);
  const activeSpeechStartedAtRef = useRef(0);
  const latestAgentSpeechStartRef = useRef<{ uid: string; at: number }>({ uid: '', at: 0 });
  const turnRequestStartedAtRef = useRef(0);
  const pendingVisualQuestionRef = useRef<WrittenQuestion | null>(null);
  const activeQuestionIdRef = useRef<string | null>(null);

  const {
    isConnected,
    messageList,
    joinChannel,
    leaveChannel,
    isAgentSpeaking,
    isAgentListening,
    inputVolume,
    setMicrophoneEnabled,
    interruptAgent,
    setAudibleAgentUid,
    agentSpeakingStartedSequence,
    agentTurnFinishedSequence,
    lastStartedAgentUid,
    lastFinishedAgentUid,
    localAudioTrack,
  } = useAgoraVoiceClient();

  useEffect(() => { awaitingRef.current = awaiting; }, [awaiting]);

  useEffect(() => {
    inputVolumeRef.current = inputVolume;
    if (inputVolume > SPEAKING_VOLUME_THRESHOLD) {
      answerQuietSinceRef.current = 0;
    }
  }, [inputVolume]);

  useEffect(() => {
    // Half-duplex transcript guard: while remote agent audio is playing, and
    // for a short acoustic tail afterwards, USER_TRANSCRIPTION can only be a
    // loudspeaker echo. A real answer is expected after the question ends.
    echoGuardUntilRef.current = isAgentSpeaking ? Number.POSITIVE_INFINITY : Date.now() + 400;
  }, [isAgentSpeaking]);

  const applyTurn = (data: TurnResponse) => {
    if (typeof data.breaks_remaining === 'number') setBreaksRemaining(data.breaks_remaining);
    if (typeof data.break_seconds_remaining === 'number' && data.break_seconds_remaining > 0) {
      // The server owns the deadline, so a reloaded tab resumes the same break
      // rather than starting a fresh one.
      breakEndsAtRef.current = Date.now() + data.break_seconds_remaining * 1000;
      setBreakEndsAt(breakEndsAtRef.current);
    }
    if (data.current_agent_id) setActiveSpeakerId(data.current_agent_id);
    if (data.agent_uid) {
      setAgentUid(data.agent_uid);
      agentUidRef.current = data.agent_uid;
    }
    // Logical floor and acoustic floor change together. Candidate/workspace/
    // evaluation phases hear no autonomous agent output; only an explicit
    // backend-granted agent turn can be played by the browser.
    setAudibleAgentUid(
      data.awaiting === 'agent' && data.agent_uid ? String(data.agent_uid) : null,
    );
    setIsFinished(data.is_finished);
    setQuestionsAsked(data.questions_asked ?? 0);
    setQuestionsTotal(data.questions_total ?? 0);
    setAwaiting(data.awaiting);
    setQuestionRevision(data.question_revision);
    questionRevisionRef.current = data.question_revision;
    const speechAlreadyStarted = Boolean(
      data.awaiting === 'agent' &&
      data.agent_uid &&
      latestAgentSpeechStartRef.current.uid === String(data.agent_uid) &&
      latestAgentSpeechStartRef.current.at >= turnRequestStartedAtRef.current
    );
    if (data.awaiting === 'agent' && speechAlreadyStarted) {
      activeSpeechRevisionRef.current = data.question_revision;
      activeSpeechStartedAtRef.current = latestAgentSpeechStartRef.current.at;
    } else if (data.awaiting === 'agent') {
      activeSpeechRevisionRef.current = 0;
      activeSpeechStartedAtRef.current = 0;
    }
    acceptingVoiceRef.current = data.awaiting === 'candidate';
    const next = data.current_question ?? null;
    const isNewQuestion = next?.id !== activeQuestionIdRef.current;
    activeQuestionIdRef.current = next?.id ?? null;
    setWrittenQuestion(next);
    if (data.current_agent_id === hostAgentId && !next) {
      pendingVisualQuestionRef.current = null;
      setVisibleQuestion(null);
      setCurrentQuestion(data.is_finished ? 'Interview complete.' : 'Conversation with your host');
    } else if (data.awaiting === 'agent') {
      pendingVisualQuestionRef.current = speechAlreadyStarted ? null : next;
      if (speechAlreadyStarted && next) {
        setVisibleQuestion(next);
        setCurrentQuestion(next.prompt);
      }
      if (isNewQuestion) {
        if (!speechAlreadyStarted) {
          setVisibleQuestion(null);
          setCurrentQuestion('');
        }
      }
    } else {
      pendingVisualQuestionRef.current = null;
      setVisibleQuestion(next);
      setCurrentQuestion(next?.prompt ?? (data.is_finished ? 'Interview complete.' : 'Listen for the next question.'));
    }
    // candidate-ready returns the same question after the spoken introduction;
    // do not erase work or results when only the speaking floor changes.
    if (isNewQuestion) {
      writeScratch(next?.starter_code ?? '');
      setRunSummary(null);
      setRunResults([]);
    }
    const progress = data.questions_total > 0 ? ` · Q${data.questions_asked}/${data.questions_total}` : '';
    setStatus(data.is_finished ? 'Interview finished' : data.question_status === 'skipped' ? `Question skipped · score 0%${progress}` : data.question_score != null ? `Answer recorded · score ${Math.round(data.question_score * 100)}%${progress}` : `${data.awaiting === 'agent' ? 'Interviewer speaking' : data.awaiting === 'workspace' ? 'Work on the question' : 'Your turn'}${progress}`);
  };

  useEffect(() => {
    if (!agentSpeakingStartedSequence) return;
    latestAgentSpeechStartRef.current = {
      uid: String(lastStartedAgentUid ?? ''),
      at: Date.now(),
    };
    if (lastStartedAgentUid !== agentUidRef.current) return;
    activeSpeechRevisionRef.current = questionRevisionRef.current;
    activeSpeechStartedAtRef.current = Date.now();
    const next = pendingVisualQuestionRef.current;
    if (!next) return;
    pendingVisualQuestionRef.current = null;
    setVisibleQuestion(next);
    setCurrentQuestion(next.prompt);
  }, [agentSpeakingStartedSequence, lastStartedAgentUid, sessionId]);

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
    // A new answer means a new question is coming, so the silence escalation
    // starts again. Keying it on the question id alone was not enough: host
    // intake carries no `current_question`, so the key stayed null for the
    // whole opening exchange and the prompts stopped after the first field -
    // the phase where a candidate is most likely to freeze.
    silenceStageRef.current = { questionId: null, stage: 0 };
    acceptingVoiceRef.current = false;
    setAwaiting('evaluation');
    setAudibleAgentUid(null);
    await setMicrophoneEnabled(false);
    setMicOn(false);
    if (agentUidRef.current) await interruptAgent(agentUidRef.current);
    if (hostUidRef.current && hostUidRef.current !== agentUidRef.current) {
      await interruptAgent(hostUidRef.current);
    }
    setActiveSpeakerId('user');
    try {
      turnRequestStartedAtRef.current = Date.now();
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
      if (submit) {
        turnRequestStartedAtRef.current = Date.now();
        setAudibleAgentUid(null);
      }
      const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/${submit ? 'submit-code' : 'run-code'}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:scratch,language:'python',question_id:writtenQuestion?.id,question_revision:questionRevisionRef.current,answer_id:submit?`${writtenQuestion?.id}:${questionRevisionRef.current}:code`:undefined})});
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Code execution failed');
      const result = submit ? data.test_run : data;
      const hiddenSummary = submit && Number(result.hidden_total) > 0 ? ` · ${result.hidden_total} hidden tests evaluated` : '';
      const scoreSummary = submit ? ` · Score ${Math.round(Number(result.score ?? 0) * 100)}%` : '';
      setRunSummary(`${result.passed}/${result.total} tests passed${scoreSummary}${hiddenSummary}${result.runtime_error ? ` · ${result.runtime_error}` : ''}`);
      setRunResults(result.results ?? []);
      if (submit) applyTurn(data.turn);
    } catch (error) { setRunSummary(error instanceof Error ? error.message : String(error)); }
    finally { setWorkspaceBusy(false); }
  };

  /**
   * Cuts the interviewer off and takes the floor.
   *
   * Shared by the microphone button and by barge-in, because they are the same
   * act: stop the agent, tell the orchestrator the candidate is speaking now,
   * and adopt whatever turn it returns. Two copies of this would be two things
   * to keep in step, and the sequence is not obvious enough to survive that.
   *
   * Returns whether the floor actually moved.
   */
  const takeFloorFromAgent = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false;
    setAudibleAgentUid(null);
    if (agentUidRef.current) await interruptAgent(agentUidRef.current);
    if (hostUidRef.current && hostUidRef.current !== agentUidRef.current) {
      await interruptAgent(hostUidRef.current);
    }
    const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}/candidate-ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_revision: questionRevisionRef.current }),
    });
    const data = await response.json() as TurnResponse & { detail?: string };
    if (!response.ok) {
      // 409 only means the orchestrator had already moved on, which is not an
      // error worth showing mid-interview.
      if (response.status !== 409) setStatus(`Error: ${data.detail ?? 'Could not interrupt the interviewer'}`);
      return false;
    }
    handledAgentTurnRef.current = agentTurnFinishedSequence;
    applyTurn(data);
    return data.awaiting === 'candidate';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, agentTurnFinishedSequence]);

  /**
   * Barge-in: the candidate starts talking over the interviewer.
   *
   * Driven by local voice-activity detection, which knows a human started
   * speaking within about a quarter of a second. The previous trigger was the
   * arrival of a transcript segment - a full speech-to-text round trip later,
   * by which point the interviewer had been talking over the candidate for
   * roughly a second.
   */
  const handleBargeIn = useCallback(() => {
    if (!sessionId || isFinished) return;
    if (awaitingRef.current !== 'agent') return;   // the floor is not the agent's to take
    if (turnInFlightRef.current || bargeInFlightRef.current) return;
    bargeInFlightRef.current = true;
    void (async () => {
      try {
        console.info('[vad] barge-in: candidate started speaking over the interviewer');
        const moved = await takeFloorFromAgent();
        if (!moved) return;
        // The words that triggered this are still arriving. Without clearing
        // the guard they would be discarded as playback echo, and the
        // candidate would have to repeat the sentence they just interrupted
        // with.
        echoGuardUntilRef.current = 0;
        await setMicrophoneEnabled(true);
        setMicOn(true);
        acceptingVoiceRef.current = true;
        setActiveSpeakerId('user');
      } finally {
        bargeInFlightRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isFinished, takeFloorFromAgent, setMicrophoneEnabled]);

  // The detector owns these refs and keeps them current, so nothing here has to
  // mirror its state into a ref of its own.
  const { speakingRef: candidateSpeakingRef, readyRef: vadReadyRef } = useSpeechDetector({
    track: localAudioTrack?.getMediaStreamTrack() ?? null,
    enabled: isConnected && !isFinished,
    onSpeechStart: handleBargeIn,
  });

  // Verbal silence: nudge, then repeat.
  //
  // Only while the floor is genuinely the candidate's, only for spoken
  // questions - a written or coding task has its own timer and is on screen to
  // read - and only while nothing has been said yet. Any speech, or the
  // question changing, cancels it.
  useEffect(() => {
    if (!sessionId || isFinished) return;
    if (awaiting !== 'candidate') return;
    if (writtenQuestion && writtenQuestion.kind !== 'verbal') return;

    const startedAt = Date.now();
    const revision = questionRevisionRef.current;

    const send = async (stage: 'nudge' | 'repeat') => {
      try {
        const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}/silence-prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question_revision: revision, stage }),
        });
        if (!response.ok) return;   // 409 just means the moment has passed
        applyTurn(await response.json() as TurnResponse);
      } catch {
        // A missed nudge is not worth interrupting the interview over.
      }
    };

    const timer = setInterval(() => {
      // Anything said, or being said, means they are answering.
      if (pendingAnswerRef.current.size > 0 || candidateSpeakingRef.current) return;
      if (turnInFlightRef.current || questionRevisionRef.current !== revision) return;

      // How far the escalation has got, tracked against the QUESTION rather
      // than this effect run.
      //
      // Prompting hands the floor to the agent and then takes it back, which
      // re-runs this effect. Local flags therefore reset every time, so the
      // first stage fired over and over roughly every ten seconds and the
      // re-ask was unreachable - the opposite of nudge-then-repeat.
      const progress = silenceStageRef.current;
      if (progress.questionId !== activeQuestionIdRef.current) {
        silenceStageRef.current = { questionId: activeQuestionIdRef.current, stage: 0 };
      }
      const stage = silenceStageRef.current.stage;
      // Two stages only. Past that the candidate has heard the question twice
      // and repeating it again is nagging, not helping.
      if (stage >= 2 || Date.now() - startedAt < SILENCE_NUDGE_MS) return;
      silenceStageRef.current = {
        questionId: activeQuestionIdRef.current,
        stage: stage + 1,
      };
      void send(stage === 0 ? 'nudge' : 'repeat');
    }, 500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaiting, questionRevision, sessionId, isFinished, writtenQuestion]);

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

      // Key on uid AND turn_id. The agent and the candidate can carry the same
      // turn_id within one exchange, so a turn_id-only key silently dropped
      // real answers.
      const key = `${m.uid}:${m.turn_id}`;
      // Already sent as part of a submitted answer; re-emitting it must not
      // reopen it.
      if (processedTurnIds.has(key)) continue;

      const firstSighting = !pendingAnswerRef.current.has(key);

      if (firstSighting) {
        // Agora may begin preparing an automatic LLM response as soon as its
        // VAD finalises a segment. Cancel that response immediately; the
        // orchestrator will provide the only acknowledgement after the
        // complete answer settles.
        //
        // Once per turn, not once per update: speech-to-text re-emits a
        // growing turn many times, and interrupting on each one is what
        // produced the -10021 rate-limit storm that made the meaningful
        // interrupts fail.
        if (agentUidRef.current) void interruptAgent(agentUidRef.current);
        // The +1 host is the meeting's sole ASR listener. Specialists receive
        // routed text, so cancel the host's automatic post-ASR response as
        // well; only the validated orchestration decision may speak next.
        if (hostUidRef.current && hostUidRef.current !== agentUidRef.current) {
          void interruptAgent(hostUidRef.current);
        }
      }

      if (Date.now() < echoGuardUntilRef.current) {
        if (firstSighting) {
          console.info(`[interview] ignored probable playback echo for turn ${m.turn_id}`);
        }
        continue;
      }

      // During a written task, ordinary speech must not accidentally submit
      // the pad. An explicit pass still works by voice.
      const explicitPass = /\b(?:i\s+(?:do\s*not|don't|dont)\s+know|no\s+(?:idea|clue)|skip|move\s+on|i\s+(?:can't|cannot|cant)\s+(?:answer|solve))\b/i.test(m.text);
      if (writtenQuestion && writtenQuestion.kind !== 'verbal' && !explicitPass) continue;

      // Every candidate segment Agora delivers, as delivered. Comparing these
      // lines with the [transcript] line the backend logs is what tells you
      // whether a clipped answer was lost in ASR or lost on the way to the
      // orchestrator - a microphone problem versus a code problem, which is
      // otherwise guesswork.
      if (pendingAnswerRef.current.get(key)?.text !== m.text) {
        console.info(
          `[asr] turn=${m.turn_id} complete=${m.complete} chars=${m.text.length} ` +
          `text=${JSON.stringify(m.text)}`,
        );
      }
      pendingAnswerRef.current.set(key, { text: m.text, complete: m.complete });
    }

    if (pendingAnswerRef.current.size === 0) return;

    // Speech-to-text splits one spoken answer into several final segments. Poll
    // the local microphone meter so a breath or thinking pause cannot submit
    // the answer and mute the candidate. New speech resets the silence clock;
    // every final segment remains buffered into the same answer.
    if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
    answerQuietSinceRef.current = 0;
    // How long to keep waiting before calling the answer finished.
    //
    // Agora's semantic endpointing has already decided the candidate completed
    // a thought (1.2s of silence, 4s hard cap) before it marks a turn final.
    // Waiting out a second, longer, volume-based timer on top of that stacked
    // the two delays and left seconds of dead air after every answer - the very
    // stack the server-side config comment claims to have removed.
    //
    // So once every buffered turn is final, only a short grace remains, just
    // wide enough for the next turn of a continued sentence to arrive. Turns
    // that are still open keep the full window, which is also what happens if
    // the transcription never reports finality at all.
    const requiredQuietMs = () =>
      [...pendingAnswerRef.current.values()].every(seg => seg.complete)
        ? FINAL_TURN_GRACE_MS
        : ANSWER_SILENCE_MS;

    const waitForCompleteAnswer = () => {
      if (!acceptingVoiceRef.current || awaiting !== 'candidate') return;
      const now = Date.now();
      // Is the candidate still talking?
      //
      // This used to be `inputVolume > 0.025`, a raw loudness reading. Room
      // tone, a fan, or breathing all sit above that, so the quiet clock was
      // reset forever and the answer was never submitted. Muting was the only
      // thing that reliably satisfied it, because muting drives the meter to
      // exactly zero - which is why the interview appeared to be driven by the
      // mute button rather than by the voice.
      //
      // Silero tells speech apart from noise, which a volume number cannot. If
      // the model is unavailable this falls back to the old meter, so the room
      // still works - it just needs a quiet environment, as before.
      const stillSpeaking = vadReadyRef.current
        ? candidateSpeakingRef.current
        : inputVolumeRef.current > SPEAKING_VOLUME_THRESHOLD;
      // Speech-to-text has already declared the turn complete, and its
      // endpointing is better informed than anything measurable here, so the
      // local check is not allowed to hold a finished answer hostage.
      const allTurnsFinal = [...pendingAnswerRef.current.values()].every(seg => seg.complete);
      if (stillSpeaking && !allTurnsFinal) {
        answerQuietSinceRef.current = 0;
      } else if (answerQuietSinceRef.current === 0) {
        answerQuietSinceRef.current = now;
      } else if (now - answerQuietSinceRef.current >= requiredQuietMs()) {
        const combined = [...pendingAnswerRef.current.values()].map(seg => seg.text).join(' ').trim();
        const answerId = `${questionRevisionRef.current}:${[...pendingAnswerRef.current.keys()].join(',')}`;
        // Retire these turns only once they are actually on their way, so a
        // late re-emit cannot append to the next question's answer.
        for (const sent of pendingAnswerRef.current.keys()) processedTurnIds.add(sent);
        pendingAnswerRef.current = new Map();
        answerQuietSinceRef.current = 0;
        answerTimerRef.current = null;
        if (combined) void handleNextTurn(combined, answerId);
        return;
      }
      answerTimerRef.current = setTimeout(waitForCompleteAnswer, 100);
    };
    answerTimerRef.current = setTimeout(waitForCompleteAnswer, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageList, isConnected, isFinished, sessionId, uid, agentUid, writtenQuestion, awaiting]);

  useEffect(() => {
    if (!agentTurnFinishedSequence || !sessionId || isFinished || questionRevisionRef.current === 0) return;
    if (lastFinishedAgentUid !== agentUidRef.current) return;
    if (agentTurnFinishedSequence === handledAgentTurnRef.current) return;
    if (
      activeSpeechRevisionRef.current !== questionRevisionRef.current ||
      Date.now() - activeSpeechStartedAtRef.current < 450
    ) {
      // This belongs to the turn interrupted immediately before the current
      // instruction. Consume it, but never transfer the current floor.
      handledAgentTurnRef.current = agentTurnFinishedSequence;
      return;
    }
    if (awaiting !== 'agent') {
      // Consume an interrupted autonomous-response event while evaluation is
      // running. It must not be reused to open the next question's floor.
      handledAgentTurnRef.current = agentTurnFinishedSequence;
      return;
    }
    handledAgentTurnRef.current = agentTurnFinishedSequence;
    activeSpeechRevisionRef.current = 0;
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
        // The microphone stays published while the interviewer speaks so the
        // candidate can cut in. Unpublishing it here made barge-in impossible
        // regardless of any server setting - the candidate was not ignored,
        // they were inaudible. The floor is still the agent's: the transcript
        // aggregator refuses candidate speech until `awaiting` says otherwise,
        // and only a sustained speech onset moves it.
        await setMicrophoneEnabled(true);
        setMicOn(false);
      }
    };
    void yieldFloor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentTurnFinishedSequence, lastFinishedAgentUid, sessionId, isFinished, awaiting]);

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
        // The token endpoint now wants proof of who is asking: the invitation
        // token for a candidate, a Supabase session for the panel's owner.
        const tokenHeaders: Record<string, string> = {};
        if (!invitationAccess) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session?.access_token) {
            tokenHeaders.Authorization = `Bearer ${sessionData.session.access_token}`;
          }
        }
        const tokenQuery = invitationAccess
          ? `&invite=${encodeURIComponent(invitationAccess.token)}`
          : '';
        const tokenRes = await fetch(
          `${BACKEND_URL}/token?channel=${encodeURIComponent(channel)}&uid=${uid}${tokenQuery}`,
          { headers: tokenHeaders },
        );
        if (!tokenRes.ok) {
          const body = await tokenRes.json().catch(() => ({}));
          throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not join the interview room.');
        }
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
        // The host RTC UID is a protocol constant for a newly created panel.
        // Grant it the initial acoustic floor before the start response so a
        // very fast opening cannot be clipped while HTTP returns session data.
        setAudibleAgentUid('1');
        turnRequestStartedAtRef.current = Date.now();
        const startRes = await fetch(invitationAccess
          ? `${BACKEND_URL}/invitations/${encodeURIComponent(invitationAccess.token)}/sessions/start`
          : `${BACKEND_URL}/sessions/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The invited path sends no candidate_name: the backend takes it from
          // the invitation, so the report names who was actually invited rather
          // than whoever is at the keyboard.
          body: JSON.stringify(invitationAccess ? {
            email: invitationAccess.email,
            channel,
            remote_uid: String(uid),
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
        sessionIdRef.current = startData.session_id;
        // Only the practice path consumes a daily attempt. An invited
        // candidate is sitting a recruiter's interview, not practising, and a
        // test run is the author checking their own panel.
        if (!invitationAccess && !testMode) {
          try { await beginInterview(startData.session_id); }
          catch { /* signed out, or the progression schema is not installed */ }
        }
        // Seeded here rather than waiting for a break response, which is what
        // the control needs before it can be shown at all.
        if (typeof startData.breaks_remaining === 'number') {
          setBreaksRemaining(startData.breaks_remaining);
        }
        setHostAgentId(startData.host_agent_id ?? '__host__');
        hostUidRef.current = String(startData.agent_uids?.[startData.host_agent_id ?? '__host__'] ?? '1');
        setAgentUid(String(startData.agent_uid ?? '1'));
        agentUidRef.current = String(startData.agent_uid ?? '1');
        setAudibleAgentUid(
          (startData.awaiting ?? 'agent') === 'agent'
            ? String(startData.agent_uid ?? '1')
            : null,
        );
        setActiveSpeakerId(startData.agent_id);
        const firstQuestion = startData.current_question ?? null;
        setWrittenQuestion(firstQuestion);
        activeQuestionIdRef.current = firstQuestion?.id ?? null;
        writeScratch(firstQuestion?.starter_code ?? '');
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
    const onUnload = () => {
      void leaveChannel();
      // Tell the backend too. Leaving the channel frees the browser's side but
      // leaves the session and its Agora agents running server-side until they
      // idle out - and the idle budget is half an hour, so an abandoned tab was
      // quietly paying for thirty minutes of agent time. sendBeacon is the only
      // request shape that reliably survives the page going away.
      const id = sessionIdRef.current;
      if (id) navigator.sendBeacon(`${BACKEND_URL}/sessions/${id}/end`);
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Ends the interview by producing the report, and stores it where it belongs.
   *
   * Three destinations, because there are three different actors:
   *
   *   published  - an anonymous candidate on an invite link. The browser has no
   *                Supabase session and `interview_reports` is gated on
   *                `auth.uid() = user_id`, so the write cannot happen here at
   *                all. The backend builds and stores it under the panel's
   *                owner, who is the only person allowed to read it back. This
   *                is the path that used to fail silently and lose every real
   *                candidate report.
   *   owner run  - a signed-in owner running their own panel, stored from the
   *                browser under their own session so RLS still governs it.
   *   test run   - stored nowhere. See the note below.
   *
   * Called both when the interview finishes naturally and when the candidate
   * exits early: an abandoned interview still produced measurements, and the
   * report records `completed: false` rather than pretending otherwise.
   *
   * reportSavedRef stops those two paths racing; the upsert on session_id is
   * the second line of defence if they do.
   */
  const finalizeReport = async (): Promise<void> => {
    if (!sessionId) return;
    // Return the *in-flight* work rather than returning immediately.
    //
    // The guard used to be a boolean, so a second caller saw "already started"
    // and continued straight on. handleClose then POSTed /end while the first
    // call was still fetching /report - and since /end now deletes the session
    // from memory, that fetch 404'd against a session that no longer existed
    // and the report was gone for good. Awaiting the same promise makes Exit
    // wait for the save it thought had happened.
    if (finalizeInFlightRef.current) return finalizeInFlightRef.current;
    if (reportSavedRef.current) return;
    const work = (async () => {
    reportSavedRef.current = true;
    setReportState('saving');
    setReportError(null);
    try {
      let report: InterviewReport;
      let storeError: string | null = null;

      if (invitationAccess) {
        const result = await finalizeInvitedReport(invitationAccess.token, invitationAccess.email);
        report = result.report;
        // Storage failing is not the candidate's problem and does not cost them
        // their result - they still see it, with the reason shown above it.
        storeError = result.stored ? null : result.store_error;
      } else {
        const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/report`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            typeof body.detail === 'string' ? body.detail : 'Could not build the report.',
          );
        }
        report = await res.json() as InterviewReport;
        // The one path that persists nothing. A test run exists so the author
        // can hear their own interview back; its scores describe no real
        // candidate, and writing them would put invented people in the same
        // table the hiring decisions are read from.
        if (!testMode) {
          const savedReportId = await saveReport(report, panelId, panelOverride?.enterprise?.role);
          // Bank the XP from the row that was just stored. The report id is the
          // only thing sent: the database reads the score off that row and
          // decides the award, so a client cannot choose its own number.
          // Failing here must not lose the report - the interview is finished
          // and saved either way, and the award is idempotent on retry.
          try { setXpAward(await awardInterviewXp(savedReportId)); }
          catch { /* progression is an overlay; a missed award is not a failed interview */ }
        }
      }

      const role = publishedPanel?.role ?? panelOverride?.enterprise?.role;
      const record = toReportRecord(report, role, invitationAccess ? 'published' : 'self');
      reportRecordRef.current = record;
      setReportRecord(record);
      setReportError(storeError);
      setReportState(storeError ? 'error' : 'saved');
    } catch (err) {
      // Let it be retried - a failed save should not be permanent.
      reportSavedRef.current = false;
      setReportState('error');
      setReportError(err instanceof Error ? err.message : String(err));
    }
    })();
    finalizeInFlightRef.current = work;
    try {
      await work;
    } finally {
      finalizeInFlightRef.current = null;
    }
  };

  // Save as soon as the backend says the interview is over, rather than waiting
  // for the user to click Exit. The session lives in the backend's memory and is
  // lost on restart, so the window to capture it is now.
  useEffect(() => {
    if (isFinished) void finalizeReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinished]);

  // Ending the interview no longer means leaving immediately. The candidate has
  // just finished; the report is the thing they came for. Agora and the backend
  // session are torn down here, and the room is only left once they close the
  // report - or straight away if there was no report to show.
  // The interview reaches "finished" only when one Agora event survives five
  // guards, any of which silently returns. If that event is missed the room
  // sits waiting forever.
  //
  // Deliberately not a failsafe that decides the interview is over: /report is
  // readable at any point, so guessing wrong would hand somebody a partial
  // report as though it were final. The candidate already has a working way out
  // - End finalises and shows the report - so this only makes a stall visible
  // and says what to do about it.
  useEffect(() => {
    if (isFinished || awaiting !== 'agent' || !sessionId) return;
    const stalled = window.setTimeout(() => {
      setStatus('Still waiting on the interviewer. If nothing happens, press End — your report is kept either way.');
    }, STALL_NOTICE_MS);
    return () => window.clearTimeout(stalled);
  }, [awaiting, isFinished, sessionId, questionRevision]);

  const handleClose = async () => {
    await finalizeReport();
    if (sessionId) {
      await fetch(`${BACKEND_URL}/sessions/${sessionId}/end`, { method: 'POST' }).catch(() => undefined);
      sessionIdRef.current = null;
    }
    await leaveChannel();
    setActiveSpeakerId(null);
    if (!reportRecordRef.current) router.push(exitHref);
  };

  const exitRoom = () => {
    // A test run opens in its own popup (see openInterviewTest), and closing
    // that window is exactly what discards the unsaved report. window.close()
    // only works on a script-opened window, so fall back to navigating.
    if (testMode && window.opener) { window.close(); return; }
    router.push(exitHref);
  };


  // The clock on a written or coding task.
  //
  // Starts when the task is handed over and submits whatever is in the pad when
  // it expires, because a timed assessment that silently never ends is not
  // timed. The deadline is derived from the question, so a slow render or a
  // paused tab cannot extend it.
  const [taskTimeLeft, setTaskTimeLeft] = useState<string | null>(null);
  // Survives the re-runs caused by unrelated turn responses; see the note in
  // the tick below.
  const taskDeadlineRef = useRef<{ id: string; at: number } | null>(null);
  useEffect(() => {
    const limit = writtenQuestion?.time_limit_seconds;
    const taskId = writtenQuestion?.id ?? null;
    if (!limit || !taskId || awaiting !== 'workspace' || isFinished) return;
    const revision = questionRevisionRef.current;
    let submitted = false;
    let lastTick = Date.now();
    const tick = () => {
      const now = Date.now();
      // One deadline per task.
      //
      // `applyTurn` rebuilds writtenQuestion from JSON on every response, so
      // this effect re-runs whenever anything else happens during the task -
      // and a freshly computed deadline handed back the full time. Taking a
      // break was therefore a way to reset a coding clock, which is precisely
      // what bounding breaks was meant to prevent.
      if (taskDeadlineRef.current?.id !== taskId) {
        taskDeadlineRef.current = { id: taskId, at: now + limit * 1000 };
      }
      // A paused interview must not spend the candidate's time.
      if (breakEndsAtRef.current !== null) {
        taskDeadlineRef.current = {
          id: taskId,
          at: taskDeadlineRef.current.at + (now - lastTick),
        };
      }
      lastTick = now;
      const remaining = Math.max(0, taskDeadlineRef.current.at - now);
      const total = Math.round(remaining / 1000);
      setTaskTimeLeft(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`);
      if (remaining > 0 || submitted) return;
      submitted = true;
      if (questionRevisionRef.current !== revision || turnInFlightRef.current) return;
      // Whatever they have written is the answer; an empty pad is scored as an
      // unanswered question rather than silently skipped.
      void handleNextTurn(
        scratchRef.current.trim() || "I ran out of time on this question.",
        `${writtenQuestion?.id}:${revision}:timeout`,
      );
    };
    // Deliberately not run synchronously here: a setState in the effect body
    // triggers a cascading render. One second of no clock is not worth that.
    const timer = setInterval(tick, 1000);
    return () => { clearInterval(timer); setTaskTimeLeft(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writtenQuestion, awaiting, isFinished]);

  /**
   * A short, bounded pause.
   *
   * The microphone is unpublished for the duration - this is the one moment in
   * the interview where the candidate genuinely should not be heard - and the
   * server holds the deadline, so closing the tab does not extend it.
   */
  const requestBreak = useCallback(async (action: 'start' | 'end') => {
    if (!sessionId) return;
    try {
      const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}/break`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json() as TurnResponse & { detail?: string };
      if (!response.ok) {
        setStatus(data.detail ?? 'That break could not be started.');
        // The server holds the deadline, and once it has passed the interview
        // is no longer paused there whatever this call returned. Leaving the
        // local pause in place froze the task countdown for the rest of the
        // interview - unlimited time on a timed question - and retried the
        // call once a second forever.
        if (action === 'end' && breakEndsAtRef.current !== null
            && Date.now() >= breakEndsAtRef.current) {
          breakEndsAtRef.current = null;
          setBreakEndsAt(null);
        }
        return;
      }
      if (action === 'start') {
        breakEndingRef.current = false;
        acceptingVoiceRef.current = false;
        await setMicrophoneEnabled(false);
        setMicOn(false);
      } else {
        breakEndsAtRef.current = null;
        setBreakEndsAt(null);
      }
      applyTurn(data);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, setMicrophoneEnabled]);

  // Counts the break down and ends it automatically, so an unattended tab
  // cannot leave the interview paused indefinitely.
  useEffect(() => {
    if (breakEndsAt === null) return;
    const tick = () => {
      const remaining = Math.max(0, breakEndsAt - Date.now());
      const total = Math.round(remaining / 1000);
      setBreakTimeLeft(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`);
      // Once, not once a second: the state change that stops this tick is
      // asynchronous, so without a latch every tick queues another request.
      if (remaining <= 0 && !breakEndingRef.current) {
        breakEndingRef.current = true;
        void requestBreak('end');
      }
    };
    const timer = setInterval(tick, 1000);
    return () => { clearInterval(timer); setBreakTimeLeft(null); };
  }, [breakEndsAt, requestBreak]);

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
        fixedName={invitationAccess?.candidateName}
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

  panelists.unshift({
    id: hostAgentId,
    name: 'Interview Host',
    role: 'Orchestrator',
    speaking: activeSpeakerId === hostAgentId,
  });

  const currentAgent = agents.find((a) => a.id === activeSpeakerId);

  const handleMicToggle = async () => {
    if (micOn) {
      setMicOn(false);
      await setMicrophoneEnabled(false);
      return;
    }
    if (awaiting === 'agent' && sessionId) {
      if (!await takeFloorFromAgent()) return;
    } else if (awaiting !== 'candidate') {
      return;
    }
    await setMicrophoneEnabled(true);
    setMicOn(true);
    acceptingVoiceRef.current = true;
    setActiveSpeakerId('user');
  };

  // Once the interview is over the report replaces the room, rather than the
  // candidate being bounced back to a dashboard with no idea how it went.
  if (reportRecord) {
    return (
      <InterviewResultScreen
        record={reportRecord}
        award={xpAward}
        ephemeral={testMode}
        storeError={reportState === 'error' ? reportError : null}
        onExit={exitRoom}
      />
    );
  }

  return (
    <ArenaRoom
      roundName={activeSpeakerId === hostAgentId ? 'Host' : currentAgent ? `${currentAgent.identity.role} round` : projectName || 'Interview'}
      elapsed={status}
      questionNumber={questionsAsked || 1}
      questionTotal={questionsTotal || agents.length}
      question={currentQuestion || ''}
      questionDetails={visibleQuestion ?? undefined}
      panelists={panelists}
      agentState={awaiting === 'agent' ? 'speaking' : awaiting === 'evaluation' ? 'thinking' : 'listening'}
      code={scratch}
      onCodeChange={writeScratch}
      language={codeLanguage}
      onLanguageChange={setCodeLanguage}
      micOn={micOn}
      micListening={micOn && awaiting === 'candidate' && (isAgentListening || isConnected)}
      micLevel={inputVolume}
      candidateSpeaking={micOn && awaiting === 'candidate' && inputVolume > 0.025}
      canInterrupt={awaiting === 'agent'}
      onToggleMic={() => void handleMicToggle()}
      cameraOn={cameraOn}
      onToggleCamera={() => setCameraOn((v) => !v)}
      onEnd={handleClose}
      coding={coding}
      workspaceVisible={awaiting === 'workspace'}
      onRunCode={() => void runCode(false)}
      onSubmitCode={() => void runCode(true)}
      timeLeft={taskTimeLeft}
      breaksRemaining={breaksRemaining}
      breakTimeLeft={breakTimeLeft}
      onBreak={() => void requestBreak(breakEndsAt === null ? 'start' : 'end')}
      onSubmitWritten={() => void handleNextTurn(scratch, `${writtenQuestion?.id}:${questionRevision}:written`)}
      onGiveUp={() => void handleNextTurn("I don't know; please move on.", `${writtenQuestion?.id}:${questionRevision}:gave-up`)}
      runSummary={runSummary}
      runResults={runResults}
      isRunning={workspaceBusy}
    />
  );
}

/**
 * The end-of-interview screen.
 *
 * Renders the same `InterviewReportView` the enterprise console renders, on
 * purpose: the report a candidate is shown and the report the hiring team opens
 * later are the same evaluation, and should not be two documents that quietly
 * diverge.
 *
 * `ephemeral` changes the banner and the exit wording and nothing else. A test
 * run is worth doing precisely because it shows you what the candidate will
 * actually see.
 */
function InterviewResultScreen({
  record,
  award,
  ephemeral,
  storeError,
  onExit,
}: {
  record: ReportRecord;
  award: { xp: number; level?: number; trophies?: string[] } | null;
  ephemeral: boolean;
  storeError: string | null;
  onExit: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#f7f8fa] px-6 py-10">
      <div className="mx-auto max-w-[1180px]">
        {ephemeral && (
          <div className="mb-5 rounded-xl border border-[#e2d6a8] bg-[#fdf7e3] px-5 py-4 text-sm text-[#6b5713]">
            <b>Test run - this report is not saved.</b> It exists only in this window and is
            gone when you close it. Nothing was written to the candidate reports table.
          </div>
        )}
        {storeError && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
            The interview is complete and the result below is final, but it could not be
            stored: {storeError}
          </div>
        )}
        {award && award.xp > 0 && (
          // Shown immediately, next to the result that earned it. A reward that
          // arrives later, on some other screen, stops being connected to the
          // thing the player just did.
          <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-[#cfe3d5] bg-[#f1f8f3] px-5 py-4">
            <span className="text-2xl">⭐</span>
            <div>
              <b className="text-[#256134]">+{award.xp} XP earned</b>
              {award.level !== undefined && <span className="ml-2 text-sm text-[#3d6b4b]">Level {award.level}</span>}
              {!!award.trophies?.length && (
                <p className="mt-0.5 text-sm text-[#3d6b4b]">
                  🏆 Trophy unlocked: {award.trophies.join(', ').replace(/_/g, ' ')}
                </p>
              )}
            </div>
          </div>
        )}
        <InterviewReportView record={record} />
        <div className="mt-6 flex justify-end">
          <button
            onClick={onExit}
            className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white"
          >
            {ephemeral ? 'Close test window' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
