'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * The live interview screen — the one the designs don't have.
 *
 * The pack has a lobby for desktop and mobile, and a live screen for mobile
 * only. Desktop live is missing, and it is the screen where the camera, the
 * code editor, the panel and the transcript all have to share one viewport.
 *
 * Everything here follows the arena language from the photos: #0f131d ground,
 * #00e5ff accent, monospace for data and labels, the faint 48px grid, cyan
 * left-edge on status cards. Layout is mine because there was nothing to copy.
 *
 * Presentational only. No session logic, no Agora, no fetch — it takes props
 * and renders. That keeps InterviewRoomLive's session handling untouched.
 */

export interface Panelist {
  id: string;
  name: string;
  role: string;
  speaking?: boolean;
  done?: boolean;
}

export interface ArenaRoomProps {
  roundName: string;
  elapsed: string;
  questionNumber: number;
  questionTotal: number;
  question: string;
  questionDetails?: {
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
  panelists: Panelist[];
  agentState: 'listening' | 'thinking' | 'speaking';
  code: string;
  onCodeChange: (v: string) => void;
  language: string;
  onLanguageChange: (v: string) => void;
  micOn: boolean;
  onToggleMic: () => void;
  cameraOn: boolean;
  onToggleCamera: () => void;
  onEnd: () => void;
  /** Coding questions get the editor; spoken ones get a plain notes pad. */
  coding?: boolean;
  onRunCode?: () => void;
  onSubmitCode?: () => void;
  onSubmitWritten?: () => void;
  onGiveUp?: () => void;
  runSummary?: string | null;
  runResults?: Array<{id:string;label:string;input?:string;expected?:string;actual?:string|null;passed:boolean;error?:string|null}>;
  isRunning?: boolean;
  workspaceVisible?: boolean;
}

const LANGUAGES = ['Python', 'C', 'Java'];

export function ArenaRoom(props: ArenaRoomProps) {
  const {
    roundName, elapsed, questionNumber, questionTotal, question, questionDetails,
    panelists, agentState, code, onCodeChange,
    language, onLanguageChange, micOn, onToggleMic,
    cameraOn, onToggleCamera, onEnd, coding = true,
    onRunCode, onSubmitCode, onSubmitWritten, onGiveUp, runSummary, runResults = [], isRunning = false,
    workspaceVisible = true,
  } = props;
  const hasWorkspace = workspaceVisible && !!questionDetails && questionDetails.kind !== 'verbal';

  return (
    <div className="arena-grid h-dvh overflow-hidden flex flex-col text-[var(--color-arena-ink)]">
      <StatusBar roundName={roundName} elapsed={elapsed} />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <QuestionCard n={questionNumber} total={questionTotal} question={question} details={questionDetails} />
        <div className={`mx-auto grid min-h-0 w-full flex-1 gap-3 transition-[grid-template-columns,max-width] duration-700 ease-in-out ${hasWorkspace ? 'max-w-none lg:grid-cols-[minmax(180px,220px)_minmax(360px,1fr)_minmax(220px,260px)]' : 'max-w-[1000px] lg:grid-cols-[minmax(320px,560px)_0px_minmax(280px,400px)]'}`}>
          <PanelRail panelists={panelists} agentState={agentState} />

          <main aria-hidden={!hasWorkspace} className={`min-h-0 min-w-0 overflow-hidden transition-all duration-500 ${hasWorkspace ? 'opacity-100 translate-y-0' : 'pointer-events-none h-0 lg:h-auto opacity-0 translate-y-3'}`}>
            {coding ? (
              <CodePane
                code={code}
                onChange={onCodeChange}
                language={language}
                onLanguageChange={onLanguageChange}
                onRun={onRunCode}
                onSubmit={onSubmitCode}
                onGiveUp={onGiveUp}
                runSummary={runSummary}
                results={runResults}
                examples={questionDetails?.test_cases ?? []}
                busy={isRunning}
              />
            ) : <WritingPad value={code} onChange={onCodeChange} language={language} onLanguageChange={onLanguageChange} onSubmit={onSubmitWritten} onGiveUp={onGiveUp} busy={isRunning} />}
          </main>

          <aside className="min-w-0 self-center transition-all duration-700">
            <SectionLabel>You</SectionLabel>
            <SelfView on={cameraOn} />
          </aside>
        </div>
      </div>

      <ControlBar
        micOn={micOn} onToggleMic={onToggleMic}
        cameraOn={cameraOn} onToggleCamera={onToggleCamera}
        onEnd={onEnd}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ bars -- */

function StatusBar({ roundName, elapsed }: { roundName: string; elapsed: string }) {
  return (
    <header className="shrink-0 flex items-center justify-between px-5 py-3 border-b
                       border-[var(--color-arena-line)] bg-[var(--color-arena-panel)]">
      <div className="flex items-center gap-3">
        <span
          className="arena-live-dot w-2 h-2 rounded-full bg-[var(--color-arena-live)]"
          aria-hidden="true"
        />
        <span className="font-mono text-sm tracking-widest text-[var(--color-arena-live)]">
          LIVE
        </span>
        <span className="font-mono text-sm text-[var(--color-arena-ink-soft)]">{elapsed}</span>
      </div>
      <span className="font-mono text-sm text-[var(--color-arena-ink-soft)]">{roundName}</span>
    </header>
  );
}

function ControlBar({
  micOn, onToggleMic, cameraOn, onToggleCamera, onEnd,
}: Pick<ArenaRoomProps, 'micOn' | 'onToggleMic' | 'cameraOn' | 'onToggleCamera' | 'onEnd'>) {
  return (
    <footer className="shrink-0 flex items-center justify-center gap-3 px-5 py-4 border-t
                       border-[var(--color-arena-line)] bg-[var(--color-arena-panel)]">
      <RoundToggle on={micOn} onClick={onToggleMic} label="microphone">
        {micOn ? <MicIcon /> : <MicOffIcon />}
      </RoundToggle>
      <RoundToggle on={cameraOn} onClick={onToggleCamera} label="camera">
        {cameraOn ? <CamIcon /> : <CamOffIcon />}
      </RoundToggle>

      <button
        onClick={onEnd}
        className="ml-4 flex items-center gap-2 px-6 py-3 rounded-[var(--radius-control)]
                   font-mono text-sm tracking-wide text-white
                   bg-[var(--color-arena-danger)] hover:brightness-125 transition"
      >
        End interview
      </button>
    </footer>
  );
}

function RoundToggle({
  on, onClick, label, children,
}: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={`${on ? 'Turn off' : 'Turn on'} ${label}`}
      className={`w-12 h-12 rounded-full grid place-items-center transition
        ${on
          ? 'bg-[var(--color-arena-raised)] text-[var(--color-arena-ink)] hover:brightness-125'
          : 'bg-[var(--color-arena-danger)] text-white'}`}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- rail -- */

function PanelRail({
  panelists, agentState,
}: { panelists: Panelist[]; agentState: ArenaRoomProps['agentState'] }) {
  return (
    <aside className="w-full lg:w-[264px] shrink-0 flex flex-col gap-3">
      <SectionLabel>Panel</SectionLabel>

      <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-visible">
        {panelists.map((p) => (
          <PanelistCard key={p.id} p={p} agentState={agentState} />
        ))}
      </div>
    </aside>
  );
}

function PanelistCard({ p, agentState }: { p: Panelist; agentState: ArenaRoomProps['agentState'] }) {
  const active = !!p.speaking;
  return (
    <div
      className={`shrink-0 min-w-[200px] lg:min-w-0 rounded-[var(--radius-card)] p-3
                  border transition
        ${active
          ? 'bg-[var(--color-arena-raised)] border-[var(--color-arena-cyan)] arena-edge'
          : 'bg-[var(--color-arena-panel)] border-[var(--color-arena-line)] opacity-55'}`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full grid place-items-center border
            ${active
              ? 'border-[var(--color-arena-cyan)] text-[var(--color-arena-cyan)]'
              : 'border-[var(--color-arena-line)] text-[var(--color-arena-ink-mute)]'}`}
        >
          <BotIcon />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{p.name}</div>
          <div className="font-mono text-[11px] text-[var(--color-arena-ink-mute)] truncate">
            {p.role}
          </div>
        </div>
      </div>

      {active && (
        <div className="mt-3 flex items-center gap-2">
          <Waveform />
          <span className="font-mono text-[11px] text-[var(--color-arena-cyan)]">
            {agentState === 'speaking' ? 'Speaking' :
             agentState === 'thinking' ? 'Thinking' : 'Listening'}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Self-view only. The camera stream is never sent anywhere and the panel does
 * not see it — the AI has no vision. It is here for the same reason a video
 * call shows you your own face: people practise presence, and a black rectangle
 * where your face should be is worse practice than no camera at all.
 */
function SelfView({ on }: { on: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    if (on) {
      navigator.mediaDevices
        .getUserMedia({ video: { width: 480, height: 360 }, audio: false })
        .then((s) => {
          if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
          setError(null);
        })
        .catch(() => setError('Camera unavailable'));
    }

    // Tracks must be stopped explicitly or the recording indicator stays lit
    // after the component unmounts.
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on]);

  return (
    <div className="relative aspect-video rounded-[var(--radius-card)] overflow-hidden
                    border border-[var(--color-arena-line)] bg-[var(--color-arena-panel)]">
      {on && !error ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]"
        />
      ) : (
        <div className="w-full h-full grid place-items-center font-mono text-[11px]
                        text-[var(--color-arena-ink-mute)] px-3 text-center">
          {error ?? 'Camera off'}
        </div>
      )}
      <span className="absolute bottom-2 left-2 font-mono text-[10px] px-1.5 py-0.5 rounded
                       bg-black/60 text-[var(--color-arena-ink-soft)]">
        self view only
      </span>
    </div>
  );
}

/* -------------------------------------------------------------- centre -- */

function QuestionCard({ n, total, question, details }:
  { n: number; total: number; question: string; details?: ArenaRoomProps['questionDetails'] }) {
  const category = details?.tags.find((tag) => !/^(easy|medium|hard)$/i.test(tag));
  const labelledDifficulty = details?.tags.find((tag) => /^(easy|medium|hard)$/i.test(tag));
  const difficulty = labelledDifficulty ?? (details?.difficulty ? `Level ${details.difficulty}` : undefined);

  return (
    <section className="shrink-0 rounded-[var(--radius-card)] p-3 md:px-5 md:py-3 arena-edge
                        bg-[var(--color-arena-panel)] border border-[var(--color-arena-line)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.18em] text-[var(--color-arena-cyan)]">QUESTION {String(n).padStart(2, '0')}</span>
          {category && <span className="rounded-full border border-[var(--color-arena-line)] px-2.5 py-1 text-[11px] text-[var(--color-arena-ink-mute)]">{category}</span>}
        </div>
        <div className="flex items-center gap-2">
          {difficulty && <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">{difficulty}</span>}
          <span className="font-mono text-xs text-[var(--color-arena-ink-mute)]">{n} / {total}</span>
        </div>
      </div>
      <h1 className="text-sm font-bold md:text-base">{details?.title ?? (details?.kind === 'verbal' ? 'Verbal question' : details?.kind === 'coding' ? 'Coding question' : 'Written question')}</h1>
      <p className="mt-1 max-w-[120ch] whitespace-pre-wrap text-sm leading-5 text-[var(--color-arena-ink-soft)]">
        {details?.prompt ?? question}
      </p>
      {details && (
        <div className="mt-2 text-[11px] text-[var(--color-arena-ink-mute)]">
          {details.kind === 'verbal' ? 'Answer this question aloud.' : 'The interviewer will not read this prompt aloud.'}
        </div>
      )}
      {!!details?.constraints?.length && <p className="mt-1 text-[11px] text-[var(--color-arena-ink-mute)]">Constraints: {details.constraints.join(' · ')}</p>}
    </section>
  );
}

function CodePane({
  code, onChange, language, onLanguageChange, onRun, onSubmit, onGiveUp, runSummary, results, examples, busy,
}: { code: string; onChange: (v: string) => void; language: string; onLanguageChange: (v: string) => void; onRun?:()=>void; onSubmit?:()=>void; onGiveUp?:()=>void; runSummary?:string|null; results:Array<{id:string;label:string;input?:string;expected?:string;actual?:string|null;passed:boolean;error?:string|null}>; examples:Array<{id:string;label:string;input_display:string;expected_display:string}>; busy?:boolean }) {
  const lines = Math.max(code.split('\n').length, 16);

  return (
    <section className="h-full min-h-0 flex flex-col rounded-[var(--radius-card)]
                        overflow-hidden border border-[var(--color-arena-line)]
                        bg-[var(--color-arena-panel)]">
      <div className="flex items-center justify-between px-4 py-2.5
                      border-b border-[var(--color-arena-line)]
                      bg-[var(--color-arena-raised)]">
        <span className="font-mono text-xs tracking-wide text-[var(--color-arena-ink-soft)]">
          Terminal
        </span>
        <label className="flex items-center gap-2">
          <span className="sr-only">Language</span>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="font-mono text-xs px-2 py-1 rounded
                       bg-[var(--color-arena-bg)] text-[var(--color-arena-ink)]
                       border border-[var(--color-arena-line)]"
          >
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-arena-line)] px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[var(--color-arena-ink-mute)]" title={runSummary ?? undefined}>{runSummary ?? 'Visible tests on Run · hidden tests on Submit'}</span>
        <div className="flex shrink-0 gap-1.5">
          <button disabled={busy} onClick={onGiveUp} className="rounded border border-[var(--color-arena-line)] px-2 py-1.5 text-[11px] disabled:opacity-40">I don&apos;t know</button>
          <button disabled={busy} onClick={onRun} className="rounded border border-[var(--color-arena-line)] px-2 py-1.5 text-[11px] disabled:opacity-40">Run</button>
          <button disabled={busy} onClick={onSubmit} className="rounded bg-[var(--color-arena-cyan)] px-2 py-1.5 text-[11px] font-bold text-black disabled:opacity-40">Submit</button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Gutter scrolls with the textarea because both use the same line-height. */}
        <div
          aria-hidden="true"
          className="select-none py-3 px-3 text-right font-mono text-xs leading-6
                     text-[var(--color-arena-ink-mute)] bg-[var(--color-arena-bg)]
                     border-r border-[var(--color-arena-line)]"
        >
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          value={code}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder="Write your solution here…"
          className="min-h-0 flex-1 resize-none overflow-y-auto py-3 px-4 font-mono text-sm leading-6
                     bg-[var(--color-arena-bg)] text-[var(--color-arena-ink)]
                     placeholder:text-[var(--color-arena-ink-mute)] outline-none"
        />
      </div>
      {(!!results.length || !!examples.length) && <div className="max-h-32 overflow-y-auto border-t border-[var(--color-arena-line)] p-3"><div className="grid gap-2 md:grid-cols-2">{(results.length ? results : examples.map(item=>({id:item.id,label:item.label,input:item.input_display,expected:item.expected_display,passed:false}))).map(result=><div key={result.id} className={`rounded border p-2 font-mono text-[10px] ${results.length?(result.passed?'border-emerald-500/40 bg-emerald-500/5':'border-red-500/40 bg-red-500/5'):'border-[var(--color-arena-line)] bg-black/20'}`}><b className={results.length?(result.passed?'text-emerald-300':'text-red-300'):''}>{results.length?(result.passed?'PASS · ':'FAIL · '):''}{result.label}</b>{result.input&&<div className="mt-1 text-[var(--color-arena-ink-mute)]">Input: {result.input}</div>}{result.expected&&<div className="text-[var(--color-arena-ink-mute)]">Expected: {result.expected}</div>}{'error' in result&&result.error&&<div className="mt-1 text-red-300">{result.error}</div>}{'actual' in result&&result.actual!=null&&<div className="text-[var(--color-arena-ink-mute)]">Actual: {result.actual}</div>}</div>)}</div></div>}
    </section>
  );
}

function WritingPad({value,onChange,language,onLanguageChange,onSubmit,onGiveUp,busy}:{value:string;onChange:(value:string)=>void;language:string;onLanguageChange:(value:string)=>void;onSubmit?:()=>void;onGiveUp?:()=>void;busy?:boolean}) {
  return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-arena-line)] bg-[var(--color-arena-panel)]"><div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-arena-line)] bg-[var(--color-arena-raised)] px-3 py-2"><div className="flex items-center gap-2"><span className="font-mono text-xs text-[var(--color-arena-ink-soft)]">Terminal</span><select aria-label="Language" value={language} onChange={event=>onLanguageChange(event.target.value)} className="rounded border border-[var(--color-arena-line)] bg-[var(--color-arena-bg)] px-2 py-1 font-mono text-xs text-[var(--color-arena-ink)]">{LANGUAGES.map(item=><option key={item} value={item}>{item}</option>)}</select></div><div className="flex shrink-0 gap-1.5"><button disabled={busy} onClick={onGiveUp} className="rounded border border-[var(--color-arena-line)] px-2 py-1.5 text-[11px] disabled:opacity-40">I don&apos;t know</button><button disabled={busy||!value.trim()} onClick={onSubmit} className="rounded bg-[var(--color-arena-cyan)] px-2 py-1.5 text-[11px] font-bold text-black disabled:opacity-40">Submit</button></div></div><textarea value={value} onChange={event=>onChange(event.target.value)} placeholder="Structure your answer here…" className="min-h-0 flex-1 resize-none overflow-y-auto bg-[var(--color-arena-bg)] p-5 text-sm leading-6 text-[var(--color-arena-ink)] outline-none placeholder:text-[var(--color-arena-ink-mute)]"/></section>;
}

/* ------------------------------------------------------------- pieces -- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] tracking-widest mb-2
                    text-[var(--color-arena-ink-mute)]">
      {children}
    </div>
  );
}

/** Six bars, fixed heights, animated by CSS. Not tied to real audio — the
 *  session layer can drive it later if it wants to. */
function Waveform() {
  const heights = [8, 14, 6, 16, 10, 12];
  return (
    <div className="flex items-end gap-[3px] h-4" aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm bg-[var(--color-arena-cyan)] arena-live-dot"
          style={{ height: `${h}px`, animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

const ico = 'w-5 h-5';
const MicIcon = () => (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/></svg>
);
const MicOffIcon = () => (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round"><path d="M2 2l20 20"/><path d="M9 9v3a3 3 0 0 0 5.1 2.1"/>
    <path d="M15 9.3V5a3 3 0 0 0-5.9-.8"/><path d="M19 10v2a7 7 0 0 1-1.3 4M12 19v3"/></svg>
);
const CamIcon = () => (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
);
const CamOffIcon = () => (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round"><path d="M2 2l20 20"/><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>
    <path d="M23 7l-7 5"/></svg>
);
const BotIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round"><rect x="4" y="8" width="16" height="12" rx="2"/>
    <path d="M12 4v4M9 14h.01M15 14h.01"/></svg>
);
