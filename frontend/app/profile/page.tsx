'use client';

import { PracticeShell } from '@/components/practice/PracticeShell';
import { PROFILE as P, USER } from '@/lib/mockData';

export default function ProfilePage() {
  return (
    <PracticeShell user={USER} active="Dashboard">
      <div className="flex flex-wrap items-start gap-6 mb-8">
        <div className="relative">
          <div className="w-28 h-28 rounded-full grid place-items-center text-4xl font-extrabold
                          text-white bg-[var(--color-practice-accent)]">
            {P.name.charAt(0)}
          </div>
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
                           text-xs font-bold text-white bg-[var(--color-practice-deep)]">
            Lvl {P.level}
          </span>
        </div>

        <div className="flex-1 min-w-[220px]">
          <h1 className="text-4xl font-extrabold tracking-tight">{P.name}</h1>
          <p className="text-xl font-bold text-[var(--color-practice-accent)] mt-1">{P.title}</p>
          <p className="text-sm text-[var(--color-practice-ink-soft)] mt-2">
            Goal: {P.goal}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button className="px-6 py-3 rounded-full font-semibold text-white
                             bg-[var(--color-practice-accent)] hover:brightness-110 transition">
            Edit profile
          </button>
          <button className="px-6 py-3 rounded-full font-semibold
                             bg-[var(--color-practice-surface)]
                             border border-[var(--color-practice-border)]
                             hover:bg-[var(--color-practice-sunken)] transition">
            Account settings
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] mb-6">
        <section className="rounded-[var(--radius-panel)] p-7
                            bg-[var(--color-practice-surface)]
                            border border-[var(--color-practice-border)]">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-extrabold">Experience points</h2>
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold
                             bg-[var(--color-practice-sunken)]">
              Total: {P.totalXp.toLocaleString()} XP
            </span>
          </div>

          <div className="flex justify-between text-sm mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold
                             bg-[var(--color-practice-sunken)]
                             text-[var(--color-practice-accent)]">
              Level {P.level}
            </span>
            <span className="text-[var(--color-practice-ink-soft)]">
              {P.toNextLevel}% to level {P.level + 1}
            </span>
          </div>
          <div className="h-3 rounded-full bg-[var(--color-practice-sunken)] mb-7">
            <div className="h-full rounded-full bg-[var(--color-practice-accent)]"
                 style={{ width: `${P.toNextLevel}%` }} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Tile label="Streak"   value={`${P.streak} days`} tone="pass" />
            <Tile label="Gems"     value={String(P.gems)}     tone="xp" />
            <Tile label="Trophies" value={String(P.trophies)} tone="gem" />
          </div>
        </section>

        <section className="rounded-[var(--radius-panel)] p-7 text-white
                            bg-[var(--color-practice-accent)]">
          <h2 className="text-xl font-extrabold mb-1">Readiness score</h2>
          <p className="text-sm text-white/75 mb-6">Based on your recent interviews.</p>
          <div className="flex items-baseline gap-1 mb-5">
            <span className="text-6xl font-extrabold">{P.readiness}</span>
            <span className="text-white/70 text-xl">/100</span>
          </div>
          <span className="inline-flex px-4 py-1.5 rounded-full text-xs font-bold
                           bg-[#6cf8bb] text-[#00714d]">
            {P.readyLabel}
          </span>
        </section>
      </div>

      <section className="rounded-[var(--radius-panel)] p-7
                          bg-[var(--color-practice-surface)]
                          border border-[var(--color-practice-border)]">
        <h2 className="text-xl font-extrabold mb-5">Trophy cabinet</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {P.earned.map((t) => (
            <Trophy key={t.name} name={t.name} hint={t.hint} earned />
          ))}
          {P.locked.map((t) => (
            <Trophy key={t.name} name={t.name} hint={t.hint} />
          ))}
        </div>
      </section>
    </PracticeShell>
  );
}

function Tile({ label, value, tone }:
  { label: string; value: string; tone: 'pass' | 'xp' | 'gem' }) {
  const c = tone === 'pass' ? 'var(--color-practice-pass)'
          : tone === 'xp'   ? 'var(--color-practice-xp)'
          :                   'var(--color-practice-gem)';
  return (
    <div className="rounded-[var(--radius-control)] p-4 bg-[var(--color-practice-bg)]">
      <div className="text-[11px] tracking-wide text-[var(--color-practice-ink-mute)] mb-1">
        {label}
      </div>
      <div className="text-xl font-extrabold" style={{ color: c }}>{value}</div>
    </div>
  );
}

/** Locked trophies keep their unlock condition visible — a greyed badge with a
 *  hidden requirement tells you nothing you can act on. */
function Trophy({ name, hint, earned }:
  { name: string; hint: string; earned?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-card)] p-5 border ${
      earned
        ? 'bg-[var(--color-practice-sunken)] border-transparent'
        : 'bg-[var(--color-practice-bg)] border-dashed border-[var(--color-practice-border)]'
    }`}>
      <div className={`w-10 h-10 rounded-full grid place-items-center mb-3 ${
        earned
          ? 'bg-[var(--color-practice-xp)] text-white'
          : 'bg-[var(--color-practice-sunken)] text-[var(--color-practice-ink-mute)]'
      }`}>
        {earned ? '★' : '🔒'}
      </div>
      <div className={`font-bold text-sm mb-1 ${
        earned ? '' : 'text-[var(--color-practice-ink-mute)]'}`}>
        {name}
      </div>
      <div className="text-xs text-[var(--color-practice-ink-mute)]">{hint}</div>
    </div>
  );
}
