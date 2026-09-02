'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PracticeShell } from '@/components/practice/PracticeShell';
import { CONFIGURATION as C, USER } from '@/lib/mockData';

export default function ConfigurePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'Practice' | 'Exam'>('Practice');
  const [vibe, setVibe] = useState(C.vibes[0]);
  const [liveFeedback, setLiveFeedback] = useState(true);

  return (
    <PracticeShell user={USER} active="Dashboard">
      <span className="inline-flex px-4 py-1.5 rounded-full text-xs font-bold mb-6
                       bg-[color-mix(in_srgb,var(--color-practice-pass)_18%,white)]
                       text-[var(--color-practice-pass)]">
        {C.module}
      </span>

      <h1 className="text-4xl font-extrabold tracking-tight leading-tight mb-4 max-w-[20ch]">
        {C.title}
      </h1>
      <p className="text-[var(--color-practice-ink-soft)] max-w-[62ch] mb-8">{C.blurb}</p>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <div className="rounded-[var(--radius-panel)] p-6 flex flex-wrap gap-10
                          bg-[var(--color-practice-sunken)]">
            <Fact icon="⏱" label="Estimated time" value={`${C.minutes} mins`} />
            <span className="w-px bg-[var(--color-practice-border)] self-stretch" />
            <Fact icon="🔥" label="Difficulty" value={C.difficulty} />
          </div>

          <section className="rounded-[var(--radius-panel)] p-7
                              bg-[var(--color-practice-surface)]
                              border border-[var(--color-practice-border)]">
            <h2 className="text-xl font-extrabold mb-5">Assessment focus</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {C.focus.map((f) => (
                <div key={f.title}
                     className="rounded-[var(--radius-card)] p-4
                                bg-[var(--color-practice-bg)]">
                  <div className="font-bold text-sm mb-1.5">{f.title}</div>
                  <p className="text-xs text-[var(--color-practice-ink-soft)] leading-relaxed">
                    {f.blurb}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="rounded-[var(--radius-panel)] p-7 h-fit
                          bg-[var(--color-practice-sunken)]">
          <h2 className="text-xl font-extrabold mb-6">Configure lobby</h2>

          <fieldset className="mb-6">
            <legend className="text-sm font-semibold mb-2">Interview mode</legend>
            <div className="flex rounded-full p-1 bg-[var(--color-practice-surface)]">
              {(['Practice', 'Exam'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                        className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition ${
                  mode === m
                    ? 'bg-[var(--color-practice-accent)] text-white'
                    : 'text-[var(--color-practice-ink-soft)]'
                }`}>
                  {m}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--color-practice-ink-mute)] mt-2">
              {mode === 'Practice'
                ? 'Practice allows pausing and hints.'
                : 'Exam runs straight through, with no hints.'}
            </p>
          </fieldset>

          <label className="block mb-6">
            <span className="block text-sm font-semibold mb-2">Interviewer manner</span>
            <select value={vibe} onChange={(e) => setVibe(e.target.value)}
                    className="w-full px-4 py-3 rounded-[var(--radius-control)] text-sm
                               bg-[var(--color-practice-surface)]
                               border border-[var(--color-practice-border)]">
              {C.vibes.map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>

          <div className="rounded-[var(--radius-card)] p-4 mb-7 flex items-center gap-3
                          bg-[var(--color-practice-surface)]">
            <div className="flex-1">
              <div className="font-bold text-sm">Live feedback</div>
              <div className="text-xs text-[var(--color-practice-ink-mute)]">
                Subtle hints while you answer
              </div>
            </div>
            <button
              role="switch"
              aria-checked={liveFeedback}
              aria-label="Live feedback"
              onClick={() => setLiveFeedback((v) => !v)}
              className={`w-12 h-7 rounded-full relative transition ${
                liveFeedback
                  ? 'bg-[var(--color-practice-accent)]'
                  : 'bg-[var(--color-practice-border)]'}`}
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
                liveFeedback ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <button onClick={() => router.push('/interview-room')}
                  className="w-full py-4 rounded-full font-extrabold text-white
                             bg-[var(--color-practice-deep)] hover:brightness-110 transition">
            Enter lobby →
          </button>
          <p className="text-xs text-center text-[var(--color-practice-ink-mute)] mt-3">
            Microphone and camera checks come next.
          </p>
        </aside>
      </div>
    </PracticeShell>
  );
}

function Fact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-14 h-14 rounded-full grid place-items-center text-2xl
                       bg-[var(--color-practice-surface)]" aria-hidden="true">{icon}</span>
      <div>
        <div className="text-[11px] tracking-wide text-[var(--color-practice-ink-mute)]">
          {label}
        </div>
        <div className="text-2xl font-extrabold">{value}</div>
      </div>
    </div>
  );
}
