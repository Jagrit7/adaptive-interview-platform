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

export interface TranscriptLine {
  id: string;
  who: 'agent' | 'candidate';
  name: string;
  text: string;
}

export interface ArenaRoomProps {
  roundName: string;
  elapsed: string;
  questionNumber: number;
  questionTotal: number;
  question: string;
  panelists: Panelist[];
  transcript: TranscriptLine[];
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
}

const LANGUAGES = ['Python', 'JavaScript', 'TypeScript', 'Java', 'Go', 'C++', 'SQL'];

export function ArenaRoom(props: ArenaRoomProps) {
  const {
    roundName, elapsed, questionNumber, questionTotal, question,
    panelists, transcript, agentState, code, onCodeChange,
    language, onLanguageChange, micOn, onToggleMic,
    cameraOn, onToggleCamera, onEnd, coding = true,
  } = props;

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [transcript.length]);

  return (
    <div className="arena-grid min-h-screen flex flex-col text-[var(--color-arena-ink)]">
      <StatusBar roundName={roundName} elapsed={elapsed} />

      {/* Three columns on desktop; the photos' single stack on mobile. */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-0">
        <PanelRail panelists={panelists} agentState={agentState} cameraOn={cameraOn} />

        <main className="flex-1 flex flex-col gap-4 min-w-0">
          <QuestionCard n={questionNumber} total={questionTotal} question={question} />
          {coding ? (
            <CodePane
              code={code}
              onChange={onCodeChange}
              language={language}
              onLanguageChange={onLanguageChange}
            />
          ) : (
            <NotesPane code={code} onChange={onCodeChange} />
          )}
        </main>

        <TranscriptPane lines={transcript} endRef={transcriptEndRef} />
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
    <header className="flex items-center justify-between px-5 py-3 border-b
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
    <footer className="flex items-center justify-center gap-3 px-5 py-4 border-t
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
  panelists, agentState, cameraOn,
}: { panelists: Panelist[]; agentState: ArenaRoomProps['agentState']; cameraOn: boolean }) {
  return (
    <aside className="w-full lg:w-[264px] shrink-0 flex flex-col gap-3">
      <SectionLabel>Panel</SectionLabel>

      <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-visible">
        {panelists.map((p) => (
          <PanelistCard key={p.id} p={p} agentState={agentState} />
        ))}
      </div>

      <div className="mt-auto hidden lg:block">
        <SectionLabel>You</SectionLabel>
        <SelfView on={cameraOn} />
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

function QuestionCard({ n, total, question }:
  { n: number; total: number; question: string }) {
  return (
    <section className="rounded-[var(--radius-card)] p-5 arena-edge
                        bg-[var(--color-arena-panel)] border border-[var(--color-arena-line)]">
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h1 className="text-xl font-semibold">Question {n}</h1>
        <span className="font-mono text-xs text-[var(--color-arena-ink-mute)]">
          {n} / {total}
        </span>
      </div>
      <p className="text-[var(--color-arena-ink-soft)] leading-relaxed max-w-[70ch]">
        {question}
      </p>
    </section>
  );
}

function CodePane({
  code, onChange, language, onLanguageChange,
}: { code: string; onChange: (v: string) => void; language: string; onLanguageChange: (v: string) => void }) {
  const lines = Math.max(code.split('\n').length, 16);

  return (
    <section className="flex-1 min-h-[280px] flex flex-col rounded-[var(--radius-card)]
                        overflow-hidden border border-[var(--color-arena-line)]
                        bg-[var(--color-arena-panel)]">
      <div className="flex items-center justify-between px-4 py-2.5
                      border-b border-[var(--color-arena-line)]
                      bg-[var(--color-arena-raised)]">
        <span className="font-mono text-xs tracking-wide text-[var(--color-arena-ink-soft)]">
          Your answer
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
          placeholder="Type your code or explanation here…"
          className="flex-1 resize-none py-3 px-4 font-mono text-sm leading-6
                     bg-[var(--color-arena-bg)] text-[var(--color-arena-ink)]
                     placeholder:text-[var(--color-arena-ink-mute)] outline-none"
        />
      </div>
    </section>
  );
}

function NotesPane({ code, onChange }: { code: string; onChange: (v: string) => void }) {
  return (
    <section className="flex-1 min-h-[220px] flex flex-col rounded-[var(--radius-card)]
                        overflow-hidden border border-[var(--color-arena-line)]
                        bg-[var(--color-arena-panel)]">
      <div className="px-4 py-2.5 border-b border-[var(--color-arena-line)]
                      bg-[var(--color-arena-raised)]">
        <span className="font-mono text-xs tracking-wide text-[var(--color-arena-ink-soft)]">
          Scratchpad
        </span>
      </div>
      <textarea
        value={code}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Jot notes while you think. Nobody scores what you write here."
        className="flex-1 resize-none p-4 text-sm leading-6
                   bg-[var(--color-arena-bg)] text-[var(--color-arena-ink)]
                   placeholder:text-[var(--color-arena-ink-mute)] outline-none"
      />
    </section>
  );
}

/* ---------------------------------------------------------- transcript -- */

function TranscriptPane({
  lines, endRef,
}: { lines: TranscriptLine[]; endRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <aside className="w-full lg:w-[320px] shrink-0 flex flex-col min-h-0">
      <SectionLabel>Transcript</SectionLabel>
      <div className="flex-1 min-h-[160px] lg:min-h-0 overflow-y-auto rounded-[var(--radius-card)]
                      p-3 space-y-3 bg-[var(--color-arena-panel)]
                      border border-[var(--color-arena-line)]">
        {lines.length === 0 && (
          <p className="font-mono text-xs text-[var(--color-arena-ink-mute)] p-2">
            The conversation will appear here as you speak.
          </p>
        )}
        {lines.map((l) => (
          <div key={l.id}>
            <div className={`font-mono text-[11px] mb-1 ${
              l.who === 'agent'
                ? 'text-[var(--color-arena-cyan)]'
                : 'text-[var(--color-arena-ink-mute)]'
            }`}>
              {l.name}
            </div>
            <p className="text-sm leading-relaxed text-[var(--color-arena-ink-soft)]">
              {l.text}
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </aside>
  );
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
