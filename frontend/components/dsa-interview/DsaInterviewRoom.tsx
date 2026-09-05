'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveDsaReport } from '@/lib/reports';
import { awardInterviewXp, beginInterview } from '@/lib/gamification';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bot, Camera, CameraOff, CheckCircle2, ChevronLeft, Clock3, Code2,
  Loader2, Mic, MicOff, Play, Send, ShieldCheck, Sparkles, Terminal, UserRound, Wifi,
} from 'lucide-react';
import { useAgoraVoiceClient, type IMessageListItem } from '@/hooks/useAgoraVoiceClient';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';

type InterviewPhase = 'introduction' | 'coding' | 'follow_up' | 'finished';

const STARTER_CODE = `def solution(values):
    # Your selected question will appear after the introduction.
    pass
`;

const INTRO_FAILSAFE_MS = 120_000;
const QUESTION_SECONDS = 20 * 60;
const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID ?? '02bcecea17334c6dad96219c276fbd38';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const AGORA_JOIN_TIMEOUT_MS = 15_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function describeBootstrapError(error: unknown): string {
  if (error instanceof TypeError && /failed to fetch/i.test(error.message)) {
    return "The interview backend is unavailable. Start the backend service on port 8000, then reload this page.";
  }
  const value = error as { name?: string; code?: string | number; message?: string };
  const detail = `${value?.name ?? ''} ${value?.code ?? ''} ${value?.message ?? String(error)}`.toLowerCase();
  if (value?.name === 'NotAllowedError' || detail.includes('permission_denied') || detail.includes('permission denied')) {
    return 'Microphone access is blocked. Allow microphone access for this site, then reload the interview.';
  }
  if (value?.name === 'NotFoundError' || detail.includes('no audio input')) {
    return 'No microphone was found. Connect or enable an input device, then reload the interview.';
  }
  if (value?.name === 'NotReadableError' || detail.includes('could not start audio source')) {
    return 'The microphone is busy. Close other apps using it, then reload the interview.';
  }
  return value?.message ?? String(error);
}

interface DsaQuestion {
  id: string;
  title: string;
  prompt: string;
  difficulty: number;
  duration_seconds: number;
  language: 'python';
  starter_code: string;
  topics: { slug: string; name?: string; is_primary?: boolean }[];
  test_cases: { id: string; label: string; input_display: string; expected_display: string }[];
  constraints: string[];
}

interface TestRun {
  passed: number;
  total: number;
  runtime_error: string | null;
  results: {
    id: string; label: string; input: string; expected: string;
    actual: string | null; passed: boolean; error: string | null;
  }[];
}

interface DsaReport {
  session_id: string;
  candidate_name: string;
  question_title: string;
  overall_score: number;
  band: string;
  feedback: string;
  strengths: string[];
  improvements: string[];
  verbal_answer: string;
  test_run: TestRun;
  competencies: { name: string; score: number; weight: number }[];
}

export function DsaInterviewRoom() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<InterviewPhase>('introduction');
  const [code, setCode] = useState(STARTER_CODE);
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_SECONDS);
  // Read once when the coding phase opens, so the deadline is fixed rather than
  // recomputed from a value the timer itself is changing.
  const secondsLeftRef = useRef(QUESTION_SECONDS);
  const [question, setQuestion] = useState<DsaQuestion | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [submittedBecause, setSubmittedBecause] = useState<'submitted' | 'expired'>('submitted');
  const [connectionStatus, setConnectionStatus] = useState('Connecting to Ari...');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentUid, setAgentUid] = useState<string | null>(null);
  const [testRun, setTestRun] = useState<TestRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [verbalAnswer, setVerbalAnswer] = useState('');
  const [report, setReport] = useState<DsaReport | null>(null);
  const [xpAward, setXpAward] = useState<{ xp: number; level?: number; trophies?: string[]; reason?: string } | null>(null);
  // Told at the start, not at the end: a free player who has used today's
  // attempt should know before sitting a full round, not after.
  const [allowanceNotice, setAllowanceNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const [channel] = useState(() => `dsa-${crypto.randomUUID()}`);
  const [uid] = useState(() => Math.floor(Math.random() * 1_000_000) + 100_000);

  const processedTurnsRef = useRef(new Set<string>());
  const introCandidateTurnsRef = useRef(0);
  const introReadyRef = useRef(false);
  const codingStartedRef = useRef(false);
  const submissionRef = useRef(false);
  const awaitingAgentEvaluationRef = useRef(false);
  const verbalAnswerRef = useRef('');
  const hasStartedRef = useRef(false);
  const teardownTimerRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const {
    isConnected, messageList, currentInProgressMessage, isAgentSpeaking,
    isAgentListening, inputVolume, voiceError,
    joinChannel, leaveChannel, setMicrophoneEnabled, setAudibleAgentUid,
  } = useAgoraVoiceClient();

  const microphoneStatus = voiceError
    ? voiceError
    : !micOn
      ? 'Microphone transmission is paused.'
      : inputVolume > 0.015
        ? `Microphone signal detected${isAgentListening ? ' — Ari is listening.' : '.'}`
        : `Microphone connected${isAgentListening ? ' — Ari is listening. Speak normally.' : ' — waiting for Ari to listen.'}`;

  const transcript = useMemo(() => messageList
    // Agora also emits control/instruction entries with service UIDs. Only the
    // two known RTC participants belong in the interview transcript.
    .filter((message) => (
      String(message.uid) === String(uid) || String(message.uid) === String(agentUid)
    ))
    .map((message) => ({
      id: `${message.uid}:${message.turn_id}`,
      who: String(message.uid) === String(uid) ? ('candidate' as const) : ('agent' as const),
      text: message.text,
    })), [agentUid, messageList, uid]);

  const endBackendSession = useCallback(async () => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) return;
    try {
      await fetch(`${BACKEND_URL}/dsa/sessions/${activeSessionId}/end`, { method: 'POST' });
    } catch {
      // Browser/channel cleanup must still run when the backend is unavailable.
    }
  }, []);

  const exit = useCallback(async () => {
    await endBackendSession();
    await leaveChannel();
    router.push('/skills/dsa');
  }, [endBackendSession, leaveChannel, router]);

  useEffect(() => {
    if (teardownTimerRef.current) {
      window.clearTimeout(teardownTimerRef.current);
      teardownTimerRef.current = null;
    }
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const start = async () => {
      try {
        setConnectionStatus('Checking interview services...');
        const { data: tokenSession } = await supabase.auth.getSession();
        const tokenResponse = await fetch(
          `${BACKEND_URL}/token?channel=${encodeURIComponent(channel)}&uid=${uid}`,
          tokenSession.session?.access_token
            ? { headers: { Authorization: `Bearer ${tokenSession.session.access_token}` } }
            : undefined,
        );
        if (!tokenResponse.ok) throw new Error('Could not create an Agora token.');
        const { token } = await tokenResponse.json();

        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Microphone access requires a secure browser context. Open the interview on localhost or HTTPS.',
          );
        }
        setConnectionStatus('Joining the interview and requesting microphone access...');
        await withTimeout(
          joinChannel({ appId: APP_ID, channel, token, uid }),
          AGORA_JOIN_TIMEOUT_MS,
          'Agora connection timed out. Check browser microphone access and try again.',
        );

        const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (isSupabaseConfigured()) {
          const { data } = await supabase.auth.getSession();
          if (data.session?.access_token) authHeaders.Authorization = `Bearer ${data.session.access_token}`;
        }
        const mode = searchParams.get('mode') ?? 'bank';
        const response = await fetch(`${BACKEND_URL}/dsa/sessions/start`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            channel, remote_uid: String(uid), mode,
            topic_slug: searchParams.get('topic'),
            blueprint_slug: searchParams.get('blueprint'),
            difficulty_min: Number(searchParams.get('difficulty_min') ?? 1),
            difficulty_max: Number(searchParams.get('difficulty_max') ?? 3),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail ?? 'Ari could not start.');

        sessionIdRef.current = data.session_id;
        setSessionId(data.session_id);
        setAgentUid(String(data.agent_uid));
        // Ari was audible to Agora and silent to the candidate.
        //
        // useAgoraVoiceClient plays a remote track only while its uid holds the
        // acoustic floor (audibleAgentUidRef), and that ref starts null - so
        // every subscribed track hit the `track.stop()` branch. The panel room
        // grants the floor explicitly; this room never did, so the agent spoke
        // into a muted subscription. The same ref also gates the
        // agent-started/agent-finished events, so turn detection was dead too.
        setAudibleAgentUid(String(data.agent_uid));
        setConnectionStatus('Ari is ready — answer out loud.');

        // Claim one of the day's attempts. The interview is not blocked when
        // the allowance is spent - the practice is still worth doing, and the
        // report is still produced - but the player is told now that it will
        // not earn XP, rather than discovering it on the results screen.
        try {
          const allowance = await beginInterview(data.session_id);
          if (!allowance.allowed && !allowance.resumed) {
            setAllowanceNotice(
              'You have used today\u2019s free interview. This round still gives you a full report, but it will not earn XP.',
            );
          }
        } catch {
          /* signed out, or the progression schema is not installed yet */
        }
      } catch (error) {
        await leaveChannel();
        setConnectionStatus(describeBootstrapError(error));
      }
    };

    void start();
    return () => {
      teardownTimerRef.current = window.setTimeout(() => {
        void endBackendSession();
        void leaveChannel();
        hasStartedRef.current = false;
      }, 400);
    };
    // This is one session bootstrap. Depending on hook callback identities
    // would restart it after isConnected changes; Strict Mode cleanup is
    // handled by the deferred teardown above.
    // URL selection is immutable for one room session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPageHide = () => {
      void endBackendSession();
      void leaveChannel();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [endBackendSession, leaveChannel]);

  useEffect(() => { secondsLeftRef.current = secondsLeft; }, [secondsLeft]);

  const beginCoding = useCallback(async () => {
    if (!sessionId || codingStartedRef.current) return;
    codingStartedRef.current = true;
    setConnectionStatus('Ari is presenting the coding brief...');
    try {
      const response = await fetch(`${BACKEND_URL}/dsa/sessions/${sessionId}/begin-coding`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? 'Could not begin the coding question.');

      const nextQuestion = data.question as DsaQuestion;
      setQuestion(nextQuestion);
      setCode(nextQuestion.starter_code);
      const remaining = Math.max(0, Math.ceil((new Date(data.deadline).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      setPhase('coding');
      // Keep the physical track/device alive but publish no candidate audio.
      await setMicrophoneEnabled(false);
      setMicOn(false);
      setConnectionStatus('Silent coding — Ari cannot hear you.');
    } catch (error) {
      codingStartedRef.current = false;
      setConnectionStatus(error instanceof Error ? error.message : String(error));
    }
  }, [sessionId, setMicrophoneEnabled]);

  // `giveUp` submits whatever is in the editor and tells the backend not to
  // dress it up: the round scores zero and Ari moves on rather than probing a
  // solution the candidate has already said they do not have. Sitting in
  // silence waiting out the timer is the worst version of that moment.
  const submitCode = useCallback(async (
    trigger: 'submitted' | 'expired' = 'submitted',
    options: { giveUp?: boolean } = {},
  ) => {
    if (!sessionId || submissionRef.current) return;
    submissionRef.current = true;
    try {
      // Always restore candidate audio before Ari asks the follow-up.
      await setMicrophoneEnabled(true);
      setMicOn(true);
      const response = await fetch(`${BACKEND_URL}/dsa/sessions/${sessionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: 'python', trigger, gave_up: Boolean(options.giveUp) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? 'Could not submit the code.');
      setTestRun(data.test_run as TestRun);
      setSubmittedBecause(data.trigger);
      setPhase('follow_up');
      setConnectionStatus('Ari is asking one verbal follow-up. Answer fully; the interview will wait.');
    } catch (error) {
      submissionRef.current = false;
      setConnectionStatus(error instanceof Error ? error.message : String(error));
    }
  }, [code, sessionId, setMicrophoneEnabled]);

  const runCode = useCallback(async () => {
    if (!sessionId || isRunning) return;
    setIsRunning(true);
    setConnectionStatus('Running public test cases...');
    try {
      const response = await fetch(`${BACKEND_URL}/dsa/sessions/${sessionId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: 'python' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? 'Could not run the code.');
      setTestRun(data as TestRun);
      setConnectionStatus(`${data.passed}/${data.total} test cases passed. You can keep editing.`);
    } catch (error) {
      setConnectionStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  }, [code, isRunning, sessionId]);

  const finish = useCallback(async () => {
    if (!sessionId || isFinishing || !verbalAnswerRef.current.trim()) return;
    setIsFinishing(true);
    setConnectionStatus('Evaluating your code and verbal answer...');
    try {
      const response = await fetch(`${BACKEND_URL}/dsa/sessions/${sessionId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verbal_answer: verbalAnswerRef.current,
          transcript: transcript.map(({ who, text }) => ({ who, text })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? 'Could not generate the report.');
      const finished = data.report as DsaReport;
      setReport(finished);
      sessionStorage.setItem(`dsa-report:${sessionId}`, JSON.stringify(finished));

      // Store the report as a normal row, then bank the XP from it. Both are
      // best-effort: a signed-out practice run, or a progression schema that is
      // not installed yet, must still show the candidate their result. The
      // sessionStorage copy above is what the screen renders either way.
      // Two different failures, deliberately handled differently. Losing the
      // XP is cosmetic. Losing the *report* means the candidate is looking at a
      // result that was never stored - and the copy on screen comes from
      // sessionStorage, so it looks saved either way. That one gets said out loud.
      let reportId: string | null = null;
      try {
        reportId = await saveDsaReport(finished);
      } catch (error) {
        setSaveError(
          error instanceof Error && /signed out/i.test(error.message)
            ? 'You are signed out, so this report was not saved to your history.'
            : 'This report could not be saved to your history. It is shown below but will be lost when you close this page.',
        );
      }
      if (reportId) {
        try { setXpAward(await awardInterviewXp(reportId)); }
        catch { /* progression is an overlay on the product, not a gate in front of it */ }
      }
      await setMicrophoneEnabled(false);
      setPhase('finished');
      setConnectionStatus('Interview complete. Your report is ready below.');
    } catch (error) {
      setConnectionStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsFinishing(false);
    }
  }, [isFinishing, sessionId, setMicrophoneEnabled, transcript]);

  useEffect(() => {
    if (!sessionId || !agentUid) return;
    for (const message of messageList) {
      const key = `${message.uid}:${message.turn_id}`;
      if (processedTurnsRef.current.has(key)) continue;
      processedTurnsRef.current.add(key);
      const fromAgent = String(message.uid) === String(agentUid);
      const fromCandidate = String(message.uid) === String(uid);
      if (!fromAgent && !fromCandidate) continue;
      if (fromCandidate) {
        if (phase === 'introduction') {
          introCandidateTurnsRef.current += 1;
          if (introCandidateTurnsRef.current >= 2) {
            introReadyRef.current = true;
            setConnectionStatus('Ari is acknowledging your answer before the coding round.');
          }
        } else if (phase === 'follow_up') {
          const combined = [verbalAnswerRef.current, message.text].filter(Boolean).join(' ');
          verbalAnswerRef.current = combined;
          setVerbalAnswer(combined);
          awaitingAgentEvaluationRef.current = true;
          setConnectionStatus('Answer captured. Ari is evaluating it and will respond before the report.');
        }
      } else if (phase === 'introduction' && introReadyRef.current) {
        // Let Ari finish the conversational acknowledgement instead of
        // injecting the coding brief while the candidate answer is processing.
        introReadyRef.current = false;
        void beginCoding();
      } else if (phase === 'follow_up' && awaitingAgentEvaluationRef.current) {
        awaitingAgentEvaluationRef.current = false;
        // The report is generated only after Ari's evaluation transcript has
        // arrived; the Agora session stays connected until the user exits.
        void finish();
      }
    }
  }, [agentUid, beginCoding, finish, messageList, phase, sessionId, uid]);

  const submitCodeRef = useRef(submitCode);
  useEffect(() => { submitCodeRef.current = submitCode; }, [submitCode]);

  // Safety net for the conversational hand-off above. If the introduction is
  // still running well after the session came up, start the coding round
  // regardless: an interview that stalls forever is worse than one that moves
  // on a little early, and the candidate has no way to tell what went wrong.
  useEffect(() => {
    if (phase !== 'introduction' || !sessionId) return;
    const failsafe = window.setTimeout(() => {
      if (!codingStartedRef.current) {
        setConnectionStatus('Moving on to the coding round.');
        void beginCoding();
      }
    }, INTRO_FAILSAFE_MS);
    return () => window.clearTimeout(failsafe);
  }, [phase, sessionId, beginCoding]);

  useEffect(() => {
    if (phase !== 'coding') return;
    const deadline = Date.now() + secondsLeftRef.current * 1000;
    const tick = () => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
        void submitCodeRef.current('expired');
      }
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const time = useMemo(() => {
    const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
    const seconds = (secondsLeft % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [secondsLeft]);

  return (
    <div className="dsa-arena min-h-screen text-[var(--color-arena-ink)] flex flex-col">
      <ArenaHeader
        phase={phase}
        time={time}
        onExit={exit}
      />

      {phase === 'introduction' && (
        <IntroductionStage
          transcript={transcript}
          inProgress={currentInProgressMessage}
          connectionStatus={`${connectionStatus} ${microphoneStatus}`}
          connected={isConnected && !!sessionId}
          agentSpeaking={isAgentSpeaking}
          onBeginCoding={() => void beginCoding()}
          cameraOn={cameraOn}
          micOn={micOn}
          onToggleCamera={() => setCameraOn((value) => !value)}
          onToggleMic={() => {
            const next = !micOn;
            setMicOn(next);
            void setMicrophoneEnabled(next);
          }}
        />
      )}

      {phase === 'coding' && (
        <CodingStage
          code={code}
          onCodeChange={setCode}
          question={question}
          time={time}
          cameraOn={cameraOn}
          micOn={micOn}
          onToggleCamera={() => setCameraOn((value) => !value)}
          onToggleMic={() => undefined}
          testRun={testRun}
          isRunning={isRunning}
          onRun={() => void runCode()}
          onSubmit={() => void submitCode('submitted')}
          onGiveUp={() => void submitCode('submitted', { giveUp: true })}
        />
      )}

      {phase === 'follow_up' && (
        <FollowUpStage
          code={code}
          trigger={submittedBecause}
          cameraOn={cameraOn}
          micOn={micOn}
          onToggleCamera={() => setCameraOn((value) => !value)}
          onToggleMic={() => {
            const next = !micOn;
            setMicOn(next);
            void setMicrophoneEnabled(next);
          }}
          onFinish={() => void finish()}
          verbalAnswer={verbalAnswer}
          isFinishing={isFinishing}
          connectionStatus={`${connectionStatus} ${microphoneStatus}`}
        />
      )}

      {allowanceNotice && phase !== 'finished' && (
        <div className="mx-6 mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200/90">
          {allowanceNotice}
        </div>
      )}
      {phase === 'finished' && <FinishedStage report={report} award={xpAward} saveError={saveError} onExit={() => void exit()} />}
    </div>
  );
}

function ArenaHeader({
  phase, time, onExit,
}: { phase: InterviewPhase; time: string; onExit: () => void }) {
  const label = {
    introduction: 'Introduction', coding: 'Coding question',
    follow_up: 'Verbal follow-up', finished: 'Complete',
  }[phase];

  return (
    <header className="sticky top-0 z-30 h-16 px-4 md:px-6 flex items-center justify-between gap-4
                       border-b border-[var(--color-arena-line)] bg-[#10141ef2] backdrop-blur-xl">
      <div className="flex items-center gap-4 min-w-0">
        <button type="button" onClick={onExit} aria-label="Leave DSA interview"
          className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-arena-line)]
                     text-[var(--color-arena-ink-soft)] hover:text-white hover:border-[var(--color-arena-cyan)] transition">
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="arena-live-dot h-2 w-2 rounded-full bg-[var(--color-arena-live)]" />
            <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-arena-live)]">LIVE</span>
            <span className="hidden sm:inline text-xs text-[var(--color-arena-ink-mute)]">DSA Foundations</span>
          </div>
          <p className="truncate text-sm font-semibold mt-0.5">{label}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {phase === 'coding' && (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-arena-cyan-deep)]
                          bg-[color-mix(in_srgb,var(--color-arena-cyan)_8%,transparent)] px-3 py-2">
            <Clock3 size={15} className="text-[var(--color-arena-cyan)]" />
            <span className="font-mono text-sm font-bold tracking-wider text-[var(--color-arena-cyan-soft)]">{time}</span>
          </div>
        )}
        <span className="hidden md:inline-flex items-center gap-2 font-mono text-[11px]
                         text-[var(--color-arena-ink-mute)]">
          <Wifi size={14} className="text-emerald-400" /> Connected
        </span>
        <button type="button" onClick={onExit}
          className="rounded-lg border border-[#64262d] bg-[#2b171d] px-3.5 py-2
                     text-xs font-bold text-[#ff9ba4] hover:bg-[#3a1b22] transition">
          End interview
        </button>
      </div>
    </header>
  );
}

function IntroductionStage({
  transcript, inProgress, connectionStatus, connected, agentSpeaking, onBeginCoding,
  cameraOn, micOn, onToggleCamera, onToggleMic,
}: {
  transcript: { id: string; who: 'agent' | 'candidate'; text: string }[];
  inProgress: IMessageListItem | null;
  connectionStatus: string;
  connected: boolean;
  agentSpeaking: boolean;
  onBeginCoding: () => void;
  cameraOn: boolean;
  micOn: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
}) {
  return (
    <main className="flex-1 grid place-items-center px-4 py-8 md:px-8">
      <div className="w-full max-w-[1060px] grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="rounded-2xl border border-[var(--color-arena-line)] bg-[#151a25e8] p-6 md:p-9
                            shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <div className="flex items-center gap-4 mb-8">
            <AgentOrb state={agentSpeaking ? 'speaking' : 'dormant'} />
            <div>
              <p className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-arena-cyan)]">ARI · DSA INTERVIEWER</p>
              <h1 className="text-2xl md:text-3xl font-extrabold mt-1">
                {connected ? 'Let’s get comfortable first.' : 'Connecting your interviewer...'}
              </h1>
            </div>
          </div>

          <div className="min-h-[210px] max-h-[300px] overflow-y-auto rounded-xl border
                          border-[var(--color-arena-line)] bg-[#0c1018] p-4 space-y-4">
            {transcript.length === 0 && (
              <div className="h-[178px] grid place-items-center text-center px-4">
                <div>
                  <div className="mx-auto h-8 w-8 rounded-full border-2 border-t-transparent
                                  border-[var(--color-arena-cyan)] animate-spin" />
                  <p className="mt-4 text-sm text-[var(--color-arena-ink-soft)]">{connectionStatus}</p>
                </div>
              </div>
            )}
            {transcript.map((line) => (
              <div key={line.id} className={line.who === 'candidate' ? 'pl-8' : 'pr-8'}>
                <p className={`font-mono text-[10px] tracking-[0.13em] mb-1 ${
                  line.who === 'agent' ? 'text-[var(--color-arena-cyan)]' : 'text-emerald-300'
                }`}>
                  {line.who === 'agent' ? 'ARI' : 'YOU'}
                </p>
                <p className="text-sm leading-relaxed text-[var(--color-arena-ink-soft)]">{line.text}</p>
              </div>
            ))}
            {inProgress && (
              <p className="text-xs italic text-[var(--color-arena-ink-mute)]">{inProgress.text}</p>
            )}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Answer Ari out loud.</p>
              <p className="text-xs text-[var(--color-arena-ink-mute)] mt-1">
                After your name and one background answer, the coding question opens automatically.
              </p>
            </div>
            <button type="button" onClick={onBeginCoding} disabled={!connected}
              className="shrink-0 h-11 inline-flex items-center justify-center gap-2 rounded-xl px-4 font-bold text-xs
                         border border-[var(--color-arena-line)] text-[var(--color-arena-ink-soft)]
                         hover:border-[var(--color-arena-cyan)] hover:text-white transition
                         disabled:opacity-40 disabled:cursor-not-allowed">
              Begin coding now <Send size={15} />
            </button>
          </div>
        </section>

        <aside className="space-y-4">
          <CandidateView cameraOn={cameraOn} />
          <DeviceControls
            cameraOn={cameraOn} micOn={micOn}
            onToggleCamera={onToggleCamera} onToggleMic={onToggleMic}
          />
          <PrivacyNote />
        </aside>
      </div>
    </main>
  );
}

function CodingStage({
  code, onCodeChange, question, time, cameraOn, micOn, onToggleCamera, onToggleMic,
  testRun, isRunning, onRun, onSubmit, onGiveUp,
}: {
  code: string;
  onCodeChange: (code: string) => void;
  question: DsaQuestion | null;
  time: string;
  cameraOn: boolean;
  micOn: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  testRun: TestRun | null;
  isRunning: boolean;
  onRun: () => void;
  onSubmit: () => void;
  onGiveUp: () => void;
}) {
  return (
    <main className="flex-1 min-h-0 p-3 md:p-4 grid gap-4 lg:grid-cols-[minmax(260px,0.72fr)_minmax(400px,1.35fr)_240px]">
      <ProblemPane time={time} question={question} />

      <section className="min-h-[560px] lg:min-h-0 flex flex-col overflow-hidden rounded-xl
                          border border-[var(--color-arena-line)] bg-[#0c1018] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <div className="h-12 shrink-0 flex items-center justify-between border-b border-[var(--color-arena-line)]
                        bg-[var(--color-arena-raised)] px-4">
          <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-arena-ink-soft)]">
            <Code2 size={15} className="text-[var(--color-arena-cyan)]" /> solution.py
          </div>
          <span className="rounded-md border border-[var(--color-arena-line)] bg-[#0f131d] px-2.5 py-1
                           font-mono text-[11px] text-[var(--color-arena-ink-soft)]">Python 3</span>
        </div>

        <div className="flex-1 min-h-0 flex">
          <LineNumbers code={code} />
          <textarea value={code} onChange={(event) => onCodeChange(event.target.value)}
            aria-label="Python solution"
            spellCheck={false}
            className="min-h-[440px] flex-1 resize-none bg-[#0c1018] px-4 py-4 font-mono text-sm leading-7
                       text-[#d7e1f1] outline-none selection:bg-[var(--color-arena-cyan-deep)]" />
        </div>

        {testRun && <TestResults run={testRun} />}

        <footer className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t
                           border-[var(--color-arena-line)] bg-[var(--color-arena-panel)] px-4 py-3">
          <p className="text-xs text-[var(--color-arena-ink-mute)]">
            Complete or incomplete code can be submitted.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onRun} disabled={isRunning}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-arena-line)] px-4 py-2
                         text-xs font-bold text-[var(--color-arena-ink-soft)] hover:border-[var(--color-arena-cyan)]
                         hover:text-white disabled:opacity-50 transition">
              {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {isRunning ? 'Running...' : 'Run code'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Skip this question?\n\nIt is scored zero and the interview moves on. This cannot be undone.')) onGiveUp();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-arena-line)]
                         px-4 py-2.5 text-sm font-semibold text-[var(--color-arena-ink-soft)] hover:bg-white/5"
            >
              I don&apos;t know
            </button>
            <button type="button" onClick={onSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-arena-cyan)] px-5 py-2.5
                         text-sm font-extrabold text-[#061218] hover:brightness-110 transition">
              Submit code <Send size={15} />
            </button>
          </div>
        </footer>
      </section>

      <aside className="space-y-4">
        <DormantAgent />
        <CandidateView cameraOn={cameraOn} />
        <DeviceControls
          cameraOn={cameraOn} micOn={micOn}
          onToggleCamera={onToggleCamera} onToggleMic={onToggleMic}
        />
        <div className="rounded-xl border border-[var(--color-arena-line)] bg-[var(--color-arena-panel)] p-4">
          <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--color-arena-ink-mute)] mb-2">SESSION MODE</p>
          <p className="text-sm font-semibold">Silent coding</p>
          <p className="text-xs leading-relaxed text-[var(--color-arena-ink-mute)] mt-1">
            Ari returns only after submission or time expiry.
          </p>
        </div>
      </aside>
    </main>
  );
}

function ProblemPane({ time, question }: { time: string; question: DsaQuestion | null }) {
  if (!question) return null;
  const example = question.test_cases[0];
  return (
    <section className="min-h-0 overflow-y-auto rounded-xl border border-[var(--color-arena-line)]
                        bg-[var(--color-arena-panel)] p-5 md:p-6 arena-edge">
      <div className="flex items-center justify-between gap-3 mb-5">
        <span className="font-mono text-[10px] tracking-[0.18em] text-[var(--color-arena-cyan)]">QUESTION 01</span>
        <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">Level {question.difficulty}</span>
      </div>
      <h1 className="text-2xl font-extrabold">{question.title}</h1>
      <p className="mt-4 text-sm leading-6 text-[var(--color-arena-ink-soft)]">
        {question.prompt}
      </p>

      <h2 className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-arena-ink-mute)] mt-7 mb-3">EXAMPLE</h2>
      {example && (
        <pre className="overflow-x-auto rounded-lg border border-[var(--color-arena-line)] bg-[#0c1018] p-4
                        font-mono text-xs leading-6 text-[#b9c7d8]">{`Input: ${example.input_display}\nExpected: ${example.expected_display}`}</pre>
      )}

      <h2 className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-arena-ink-mute)] mt-7 mb-3">
        TEST CASES ({question.test_cases.length})
      </h2>
      <div className="space-y-2">
        {question.test_cases.map((testCase, index) => (
          <div key={testCase.id} className="rounded-lg border border-[var(--color-arena-line)] bg-[#0c1018] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-[var(--color-arena-ink-soft)]">
                {index + 1}. {testCase.label}
              </span>
              <span className="font-mono text-[10px] text-[var(--color-arena-ink-mute)]">Expected {testCase.expected_display}</span>
            </div>
            <p className="mt-1.5 break-words font-mono text-[11px] text-[#8998ac]">
              {testCase.input_display}
            </p>
          </div>
        ))}
      </div>

      <h2 className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-arena-ink-mute)] mt-7 mb-3">CONSTRAINTS</h2>
      <ul className="space-y-2 text-sm text-[var(--color-arena-ink-soft)]">
        {question.constraints.map((constraint) => <li key={constraint}>• {constraint}</li>)}
      </ul>

      <div className="mt-7 rounded-lg border border-[var(--color-arena-cyan-deep)] bg-cyan-400/5 p-4">
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-arena-cyan-soft)]">
          <Clock3 size={14} /> {time} remaining
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-arena-ink-mute)]">
          The question is written here intentionally. Ari will not read it aloud.
        </p>
      </div>
    </section>
  );
}

function TestResults({ run }: { run: TestRun }) {
  return (
    <section className="max-h-[230px] shrink-0 overflow-y-auto border-t border-[var(--color-arena-line)] bg-[#090d14] p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-[var(--color-arena-ink-soft)]">
          TEST RESULTS
        </span>
        <span className={`text-xs font-bold ${run.passed === run.total ? 'text-emerald-300' : 'text-amber-300'}`}>
          {run.passed}/{run.total} passed
        </span>
      </div>
      {run.runtime_error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 font-mono text-xs text-red-200">
          {run.runtime_error}
        </p>
      )}
      <div className="space-y-2">
        {run.results.map((result) => (
          <div key={result.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 rounded-lg border border-[var(--color-arena-line)] p-2.5">
            <span className={result.passed ? 'text-emerald-300' : 'text-red-300'}>
              {result.passed ? '✓' : '×'}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--color-arena-ink-soft)]">{result.label}</p>
              <p className="mt-1 truncate font-mono text-[10px] text-[var(--color-arena-ink-mute)]">
                {result.error ?? `Expected ${result.expected} · Received ${result.actual}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FollowUpStage({
  code, trigger, cameraOn, micOn, onToggleCamera, onToggleMic, onFinish,
  verbalAnswer, isFinishing, connectionStatus,
}: {
  code: string;
  trigger: 'submitted' | 'expired';
  cameraOn: boolean;
  micOn: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onFinish: () => void;
  verbalAnswer: string;
  isFinishing: boolean;
  connectionStatus: string;
}) {
  return (
    <main className="flex-1 p-4 md:p-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-h-[620px] rounded-2xl border border-[var(--color-arena-line)] bg-[#151a25e8] p-6 md:p-8">
        <div className="flex items-center justify-between gap-4 mb-7">
          <div className="flex items-center gap-4">
            <AgentOrb state="speaking" />
            <div>
              <p className="font-mono text-[11px] tracking-[0.16em] text-[var(--color-arena-cyan)]">ARI IS ACTIVE</p>
              <h1 className="text-2xl font-extrabold mt-1">Let&apos;s discuss your approach.</h1>
            </div>
          </div>
          <span className="rounded-full border border-[var(--color-arena-line)] px-3 py-1.5
                           text-xs text-[var(--color-arena-ink-soft)]">
            {trigger === 'expired' ? 'Time expired' : 'Code submitted'}
          </span>
        </div>

        <div className="rounded-xl border border-[var(--color-arena-cyan-deep)] bg-cyan-400/5 p-5 arena-edge">
          <p className="text-lg leading-relaxed text-white">
            Walk me through the time and space complexity of your approach.
            What would you change if the input could contain multiple valid pairs?
          </p>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="overflow-hidden rounded-xl border border-[var(--color-arena-line)] bg-[#0c1018]">
            <div className="flex items-center gap-2 border-b border-[var(--color-arena-line)] px-4 py-3
                            font-mono text-xs text-[var(--color-arena-ink-soft)]">
              <Terminal size={14} /> Submitted snapshot
            </div>
            <pre className="max-h-[360px] overflow-auto p-4 font-mono text-xs leading-6 text-[#b9c7d8]">{code}</pre>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--color-arena-line)] bg-[var(--color-arena-panel)] p-4">
              <p className="font-mono text-[10px] tracking-[0.15em] text-[var(--color-arena-ink-mute)]">RESPONSE MODE</p>
              <p className="mt-2 text-sm font-bold">Speak your answer</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-arena-ink-mute)]">Ari is listening again.</p>
            </div>
            <div className="rounded-xl border border-[var(--color-arena-line)] bg-[#0c1018] p-4">
              <p className="font-mono text-[10px] tracking-[0.15em] text-[var(--color-arena-ink-mute)]">LIVE ANSWER</p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-arena-ink-soft)]">
                {verbalAnswer || 'Listening for your complete answer...'}
              </p>
            </div>
            <p className="text-xs leading-relaxed text-[var(--color-arena-ink-mute)]">{connectionStatus}</p>
            <button type="button" onClick={onFinish} disabled={!verbalAnswer || isFinishing}
              className="w-full rounded-xl bg-[var(--color-arena-cyan)] px-4 py-3 text-sm font-extrabold
                         text-[#061218] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition">
              {isFinishing ? 'Generating report...' : 'Finish and generate report'}
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <CandidateView cameraOn={cameraOn} />
        <DeviceControls cameraOn={cameraOn} micOn={micOn}
          onToggleCamera={onToggleCamera} onToggleMic={onToggleMic} />
        <div className="rounded-xl border border-[var(--color-arena-line)] bg-[var(--color-arena-panel)] p-5">
          <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--color-arena-ink-mute)] mb-4">SESSION TIMELINE</p>
          <TimelineItem done label="Introduction" />
          <TimelineItem done label="Coding question" />
          <TimelineItem active label="Verbal follow-up" />
        </div>
      </aside>
    </main>
  );
}

function FinishedStage({ report, award, saveError, onExit }: { report: DsaReport | null; award: { xp: number; level?: number; trophies?: string[]; reason?: string } | null; saveError: string; onExit: () => void }) {
  return (
    <main className="flex-1 grid place-items-center p-6">
      <section className="w-full max-w-[860px] rounded-2xl border border-[var(--color-arena-line)]
                          bg-[var(--color-arena-panel)] p-7 md:p-9 shadow-[0_24px_80px_rgba(0,0,0,.35)]">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
          <CheckCircle2 size={30} />
        </div>
        <div className="text-center">
          <p className="font-mono text-[11px] tracking-[0.18em] text-emerald-300 mt-6">SESSION COMPLETE · REPORT READY</p>
          <h1 className="text-3xl font-extrabold mt-2">{report?.candidate_name ?? 'Your'} DSA report</h1>
        </div>

        {saveError && (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-400/10 px-5 py-3 text-center text-sm text-amber-200/90">
            {saveError}
          </div>
        )}

        {award && (award.xp > 0 || award.reason === 'daily limit reached') && (
          // Next to the result that earned it. A reward delivered later, on
          // another screen, stops being connected to what the player just did.
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-center text-sm">
            {award.xp > 0 ? (
              <>
                <span className="font-bold text-emerald-300">+{award.xp} XP</span>
                {award.level !== undefined && <span className="text-emerald-200/80">Level {award.level}</span>}
                {!!award.trophies?.length && (
                  <span className="text-emerald-200/80">🏆 {award.trophies.join(', ').replace(/_/g, ' ')}</span>
                )}
              </>
            ) : (
              <span className="text-amber-200/90">
                Daily free interview already used — this report is saved, but it earned no XP today.
              </span>
            )}
          </div>
        )}

        {report ? (
          <div className="mt-7 space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <ReportMetric label="Overall" value={`${Math.round(report.overall_score * 100)}/100`} detail={report.band} />
              <ReportMetric label="Code tests" value={`${report.test_run.passed}/${report.test_run.total}`} detail="automated cases" />
              <ReportMetric label="Question" value={report.question_title} detail="Python 3" />
            </div>

            <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-xl border border-[var(--color-arena-line)] bg-[#0c1018] p-5">
                <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--color-arena-cyan)]">EVALUATION</p>
                <p className="mt-3 text-sm leading-6 text-[var(--color-arena-ink-soft)]">{report.feedback}</p>
                <div className="mt-4 space-y-3">
                  {report.competencies.map((item) => (
                    <div key={item.name}>
                      <div className="flex justify-between text-xs"><span>{item.name}</span><span>{Math.round(item.score * 100)}%</span></div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-[var(--color-arena-line)]">
                        <div className="h-full rounded-full bg-[var(--color-arena-cyan)]" style={{ width: `${item.score * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <ReportList title="Strengths" items={report.strengths} tone="good" />
                <ReportList title="Improve next" items={report.improvements} tone="warn" />
              </div>
            </div>

            <div className="rounded-xl border border-[var(--color-arena-line)] bg-[#0c1018] p-5">
              <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--color-arena-ink-mute)]">YOUR VERBAL ANSWER</p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-arena-ink-soft)]">{report.verbal_answer}</p>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-center text-sm text-[var(--color-arena-ink-soft)]">The report could not be loaded.</p>
        )}

        <div className="mt-7 text-center">
          <button type="button" onClick={onExit}
            className="rounded-xl bg-[var(--color-arena-cyan)] px-6 py-3 text-sm font-extrabold text-[#061218]">
            Return to DSA path
          </button>
        </div>
      </section>
    </main>
  );
}

function ReportMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-arena-line)] bg-[#0c1018] p-4 text-center">
      <p className="font-mono text-[10px] tracking-[0.14em] text-[var(--color-arena-ink-mute)]">{label}</p>
      <p className="mt-2 text-xl font-extrabold">{value}</p>
      <p className="mt-1 text-xs text-[var(--color-arena-ink-mute)]">{detail}</p>
    </div>
  );
}

function ReportList({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'warn' }) {
  return (
    <div className="rounded-xl border border-[var(--color-arena-line)] bg-[#0c1018] p-4">
      <p className={`font-mono text-[10px] tracking-[0.14em] ${tone === 'good' ? 'text-emerald-300' : 'text-amber-300'}`}>{title}</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--color-arena-ink-soft)]">
        {(items.length ? items : ['No specific items returned.']).map((item) => <li key={item}>• {item}</li>)}
      </ul>
    </div>
  );
}

function DormantAgent() {
  return (
    <section className="rounded-xl border border-[var(--color-arena-line)] bg-[var(--color-arena-panel)] p-5 opacity-80">
      <div className="flex items-center gap-3">
        <AgentOrb state="dormant" compact />
        <div>
          <p className="text-sm font-bold">Ari</p>
          <p className="font-mono text-[10px] tracking-[0.14em] text-[var(--color-arena-ink-mute)]">INTERVIEWER DORMANT</p>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-[var(--color-arena-line)] bg-[#0f131d] px-3 py-2.5">
        <p className="font-mono text-[11px] text-[var(--color-arena-ink-mute)]">Waiting for submission...</p>
      </div>
    </section>
  );
}

function AgentOrb({ state, compact = false }: { state: 'speaking' | 'dormant'; compact?: boolean }) {
  const size = compact ? 'h-12 w-12' : 'h-16 w-16';
  return (
    <div className={`${size} relative shrink-0 grid place-items-center rounded-full border ${
      state === 'speaking'
        ? 'border-[var(--color-arena-cyan)] bg-cyan-400/10 text-[var(--color-arena-cyan)] shadow-[0_0_30px_rgba(0,229,255,.14)]'
        : 'border-[var(--color-arena-line)] bg-[#111620] text-[var(--color-arena-ink-mute)]'
    }`}>
      <Bot size={compact ? 21 : 28} />
      {state === 'speaking' && <span className="absolute inset-[-6px] rounded-full border border-cyan-300/15 arena-live-dot" />}
    </div>
  );
}

function CandidateView({ cameraOn }: { cameraOn: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (cameraOn) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then((nextStream) => {
          if (cancelled) {
            nextStream.getTracks().forEach((track) => track.stop());
            return;
          }
          stream = nextStream;
          if (videoRef.current) videoRef.current.srcObject = nextStream;
          setError(null);
        })
        .catch(() => setError('Camera unavailable'));
    }
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraOn]);

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--color-arena-line)] bg-[var(--color-arena-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--color-arena-line)] px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-bold"><UserRound size={14} /> You</span>
        <span className="font-mono text-[9px] tracking-[0.12em] text-[var(--color-arena-ink-mute)]">SELF VIEW</span>
      </div>
      <div className="aspect-video bg-[#090d14] grid place-items-center">
        {cameraOn && !error ? (
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover scale-x-[-1]" />
        ) : (
          <div className="text-center text-[var(--color-arena-ink-mute)]">
            <CameraOff className="mx-auto" size={23} />
            <p className="mt-2 font-mono text-[10px]">{error ?? 'Camera off'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function DeviceControls({
  cameraOn, micOn, onToggleCamera, onToggleMic,
}: { cameraOn: boolean; micOn: boolean; onToggleCamera: () => void; onToggleMic: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <DeviceButton on={micOn} onClick={onToggleMic} label="Microphone"
        icon={micOn ? <Mic size={17} /> : <MicOff size={17} />} />
      <DeviceButton on={cameraOn} onClick={onToggleCamera} label="Camera"
        icon={cameraOn ? <Camera size={17} /> : <CameraOff size={17} />} />
    </div>
  );
}

function DeviceButton({ on, onClick, label, icon }:
  { on: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`rounded-xl border px-3 py-3 flex items-center justify-center gap-2 text-xs font-bold transition ${
        on
          ? 'border-[var(--color-arena-line)] bg-[var(--color-arena-raised)] text-white'
          : 'border-[#64262d] bg-[#2b171d] text-[#ff9ba4]'
      }`}>
      {icon} {label}
    </button>
  );
}

function PrivacyNote() {
  return (
    <div className="rounded-xl border border-[var(--color-arena-line)] bg-[var(--color-arena-panel)] p-4 flex gap-3">
      <ShieldCheck size={18} className="shrink-0 text-emerald-300" />
      <p className="text-xs leading-relaxed text-[var(--color-arena-ink-mute)]">
        Camera is a local self-view in this version. Recording is not enabled.
      </p>
    </div>
  );
}

function LineNumbers({ code }: { code: string }) {
  const count = Math.max(code.split('\n').length, 18);
  return (
    <div aria-hidden className="select-none border-r border-[var(--color-arena-line)] bg-[#090d14]
                                px-3 py-4 text-right font-mono text-xs leading-7 text-[#3f4858]">
      {Array.from({ length: count }, (_, index) => <div key={index}>{index + 1}</div>)}
    </div>
  );
}

function TimelineItem({ label, done = false, active = false }:
  { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="relative flex gap-3 pb-5 last:pb-0">
      <span className={`relative z-10 mt-0.5 grid h-5 w-5 place-items-center rounded-full border ${
        done ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300'
          : active ? 'border-[var(--color-arena-cyan)] bg-cyan-400/10 text-[var(--color-arena-cyan)]'
          : 'border-[var(--color-arena-line)]'
      }`}>
        {done ? <CheckCircle2 size={12} /> : active ? <Sparkles size={11} /> : null}
      </span>
      <span className={`text-sm ${active ? 'font-bold text-white' : 'text-[var(--color-arena-ink-soft)]'}`}>{label}</span>
      {label !== 'Verbal follow-up' && <span className="absolute left-[9px] top-5 h-[calc(100%-10px)] w-px bg-[var(--color-arena-line)]" />}
    </div>
  );
}
