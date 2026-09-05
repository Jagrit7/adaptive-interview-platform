'use client';

import { PracticeShell } from '@/components/practice/PracticeShell';
import { usePlayer } from '@/hooks/usePlayer';
import { RESULT } from '@/lib/mockData';

const BAR: Record<string, string> = {
  pass:   'var(--color-practice-pass)',
  warn:   'var(--color-practice-xp)',
  accent: 'var(--color-practice-accent)',
};

export default function ResultsPage() {
  const { profile } = usePlayer();
  const firstName = (profile.display_name?.trim() || 'there').split(' ')[0];
  const r = RESULT;
  // Circumference of the score ring, r=54.
  const C = 2 * Math.PI * 54;

  return (
    <PracticeShell>
      <section className="rounded-[var(--radius-panel)] bg-[var(--color-practice-sunken)]
                          p-8 mb-6 flex flex-col md:flex-row md:items-center gap-8">
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold mb-3">Great job, {firstName}.</h1>
          <p className="text-[var(--color-practice-ink-soft)] max-w-[56ch] mb-6">
            You handled that one well. Your technical communication is sharper than last
            time — keep the momentum going.
          </p>
          <div className="flex gap-3">
            <Reward tone="xp">+{r.xp} XP</Reward>
            <Reward tone="gem">+{r.gems} gems</Reward>
          </div>
        </div>

        <div className="relative w-[180px] h-[180px] shrink-0 mx-auto">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle cx="60" cy="60" r="54" fill="none" strokeWidth="12"
                    stroke="var(--color-practice-surface)" />
            <circle cx="60" cy="60" r="54" fill="none" strokeWidth="12" strokeLinecap="round"
                    stroke="var(--color-practice-accent)"
                    strokeDasharray={C} strokeDashoffset={C * (1 - r.score / 100)} />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <div className="text-4xl font-extrabold">{r.score}</div>
            <div className="text-xs text-[var(--color-practice-ink-mute)]">out of 100</div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3 mb-6">
        <Card title="Breakdown">
          <div className="space-y-4 mt-4">
            {r.breakdown.map((b) => (
              <div key={b.name}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span>{b.name}</span>
                  <span className="text-[var(--color-practice-ink-mute)]">{b.value}%</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--color-practice-sunken)]">
                  <div className="h-full rounded-full"
                       style={{ width: `${b.value}%`, background: BAR[b.tone] }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Strengths" tint="var(--color-practice-sunken)">
          <ul className="space-y-3 mt-4">
            {r.strengths.map((t) => (
              <li key={t} className="flex gap-2.5 text-sm text-[var(--color-practice-ink-soft)]">
                <span className="text-[var(--color-practice-pass)] shrink-0">✓</span>{t}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Growth areas" tint="color-mix(in srgb, var(--color-practice-xp) 10%, white)">
          <ul className="space-y-3 mt-4">
            {r.growth.map((t) => (
              <li key={t} className="flex gap-2.5 text-sm text-[var(--color-practice-ink-soft)]">
                <span className="text-[var(--color-practice-xp)] shrink-0">›</span>{t}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section className="rounded-[var(--radius-panel)] bg-[var(--color-practice-surface)]
                          border border-[var(--color-practice-border)] p-8">
        <h2 className="text-xl font-bold text-center mb-10">Your learning path</h2>

        <div className="relative flex items-start justify-between max-w-[620px] mx-auto">
          <div className="absolute left-[8%] right-[8%] top-7 h-1.5 rounded-full
                          bg-[var(--color-practice-sunken)]" aria-hidden="true" />
          <div className="absolute left-[8%] top-7 h-1.5 rounded-full
                          bg-[var(--color-practice-accent)] w-[34%]" aria-hidden="true" />

          {r.path.map((step) => (
            <div key={step.label} className="relative z-10 w-[24%] text-center">
              <div className={`w-14 h-14 mx-auto rounded-full grid place-items-center mb-2
                ${step.state === 'done'
                  ? 'bg-[var(--color-practice-pass)] text-white'
                  : step.state === 'current'
                  ? 'bg-[var(--color-practice-accent)] text-white ring-4 ring-[var(--color-practice-sunken)]'
                  : 'bg-[var(--color-practice-sunken)] text-[var(--color-practice-ink-mute)]'}`}>
                {step.state === 'done' ? '✓' : step.state === 'locked' ? '🔒' : '★'}
              </div>
              <div className={`text-sm ${
                step.state === 'locked'
                  ? 'text-[var(--color-practice-ink-mute)]'
                  : 'font-semibold'
              }`}>
                {step.label}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <button className="px-6 py-3 rounded-[var(--radius-control)] font-semibold text-white
                             bg-[var(--color-practice-accent)] hover:brightness-110 transition">
            Continue to System Design
          </button>
        </div>
      </section>
    </PracticeShell>
  );
}

function Card({ title, children, tint }:
  { title: string; children: React.ReactNode; tint?: string }) {
  return (
    <section className="rounded-[var(--radius-card)] p-6 border border-[var(--color-practice-border)]"
             style={{ background: tint ?? 'var(--color-practice-surface)' }}>
      <h2 className="font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Reward({ tone, children }: { tone: 'xp' | 'gem'; children: React.ReactNode }) {
  const c = tone === 'xp' ? 'var(--color-practice-xp)' : 'var(--color-practice-gem)';
  return (
    <span className="px-4 py-2 rounded-full text-sm font-bold bg-[var(--color-practice-surface)]
                     border border-[var(--color-practice-border)]"
          style={{ color: c }}>
      {children}
    </span>
  );
}
