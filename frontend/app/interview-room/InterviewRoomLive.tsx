'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAgoraVoiceClient } from '@/hooks/useAgoraVoiceClient';
import { useBuilderStore, type Agent } from '@/store/builderStore';
import { ArenaRoom, type Panelist } from '@/components/arena/ArenaRoom';
import { CandidateForm } from './CandidateForm';
import {
  finalizePublishedReport,
  saveReport,
  toReportRecord,
  type InterviewReport,
  type ReportRecord,
} from '@/lib/reports';
import { InterviewReportView } from '@/components/reports/InterviewReportView';
import type { PanelConfig } from '@/lib/panels';

const APP_ID = '02bcecea17334c6dad96219c276fbd38';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

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
  assessment_satisfaction?: number | null;
  awaiting: Awaiting;
  question_revision: number;
  agent_uid?: string | null;
  voice_id?: string | null;
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
  const [reportState, setReportState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [reportError, setReportError] = useState<string | null>(null);
  // The finished report, rendered in place of the room. In a test run this
  // state is the only copy that exists anywhere - nothing is written to
  // Supabase, localStorage or sessionStorage, so closing the window discards it.
  const [reportRecord, setReportRecord] = useState<ReportRecord | null>(null);
  const reportRecordRef = useRef<ReportRecord | null>(null);
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
  const [hostAgentId, setHostAgentId] = useState('__host__');
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
  // Agora can finalize a transcript segment during an ordinary thinking pause.
  // Do not equate that packet boundary with "answer complete": require a
  // sustained period of locally measured silence before submitting the joined
  // answer to the orchestrator.
  const ANSWER_SILENCE_MS = 2800;
  const SPEAKING_VOLUME_THRESHOLD = 0.025;
  const pendingAnswerRef = useRef<string[]>([]);
  const pendingAnswerIdsRef = useRef<string[]>([]);
  const answerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerQuietSinceRef = useRef(0);
  const inputVolumeRef = useRef(0);
  const turnInFlightRef = useRef(false);
  const echoGuardUntilRef = useRef(0);
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
  } = useAgoraVoiceClient();

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
      setScratch(next?.starter_code ?? '');
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
      // The +1 host is the meeting's sole ASR listener. Specialists receive
      // routed text, so cancel the host's automatic post-ASR response as well;
      // only the validated orchestration decision may speak next.
      if (hostUidRef.current && hostUidRef.current !== agentUidRef.current) {
        void interruptAgent(hostUidRef.current);
      }

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

    // Speech-to-text splits one spoken answer into several final segments. Poll
    // the local microphone meter so a breath or thinking pause cannot submit
    // the answer and mute the candidate. New speech resets the silence clock;
    // every final segment remains buffered into the same answer.
    if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
    answerQuietSinceRef.current = 0;
    const waitForCompleteAnswer = () => {
      if (!acceptingVoiceRef.current || awaiting !== 'candidate') return;
      const now = Date.now();
      if (inputVolumeRef.current > SPEAKING_VOLUME_THRESHOLD) {
        answerQuietSinceRef.current = 0;
      } else if (answerQuietSinceRef.current === 0) {
        answerQuietSinceRef.current = now;
      } else if (now - answerQuietSinceRef.current >= ANSWER_SILENCE_MS) {
        const combined = pendingAnswerRef.current.join(' ').trim();
        const answerId = `${questionRevisionRef.current}:${pendingAnswerIdsRef.current.join(',')}`;
        pendingAnswerRef.current = [];
        pendingAnswerIdsRef.current = [];
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
        await setMicrophoneEnabled(false);
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
        // The host RTC UID is a protocol constant for a newly created panel.
        // Grant it the initial acoustic floor before the start response so a
        // very fast opening cannot be clipped while HTTP returns session data.
        setAudibleAgentUid('1');
        turnRequestStartedAtRef.current = Date.now();
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
  const finalizeReport = async () => {
    if (!sessionId || reportSavedRef.current) return;
    reportSavedRef.current = true;
    setReportState('saving');
    setReportError(null);
    try {
      let report: InterviewReport;
      let storeError: string | null = null;

      if (publishedAccess) {
        const result = await finalizePublishedReport(
          publishedAccess.panelId, publishedAccess.invite, sessionId,
        );
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
        if (!testMode) await saveReport(report, panelId, panelOverride?.enterprise?.role);
      }

      const role = publishedPanel?.role ?? panelOverride?.enterprise?.role;
      const record = toReportRecord(report, role, publishedAccess ? 'published' : 'self');
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
  };

  // Save as soon as the backend says the interview is over, rather than waiting
  // for the user to click Exit. The session lives in the backend's memory and is
  // lost on restart, so the window to capture it is now.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isFinished) void finalizeReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinished]);

  // Ending the interview no longer means leaving immediately. The candidate has
  // just finished; the report is the thing they came for. Agora and the backend
  // session are torn down here, and the room is only left once they close the
  // report - or straight away if there was no report to show.
  const handleClose = async () => {
    await finalizeReport();
    if (sessionId) {
      await fetch(`${BACKEND_URL}/sessions/${sessionId}/end`, { method: 'POST' }).catch(() => undefined);
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
      setAudibleAgentUid(null);
      if (agentUidRef.current) await interruptAgent(agentUidRef.current);
      const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}/candidate-ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_revision: questionRevisionRef.current }),
      });
      const data = await response.json() as TurnResponse & { detail?: string };
      if (!response.ok) {
        if (response.status !== 409) setStatus(`Error: ${data.detail ?? 'Could not interrupt the interviewer'}`);
        return;
      }
      handledAgentTurnRef.current = agentTurnFinishedSequence;
      applyTurn(data);
      if (data.awaiting !== 'candidate') return;
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
      onCodeChange={setScratch}
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
  ephemeral,
  storeError,
  onExit,
}: {
  record: ReportRecord;
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
