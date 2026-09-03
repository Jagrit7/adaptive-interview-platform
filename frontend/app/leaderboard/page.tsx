'use client';

import { useState } from 'react';
import { PracticeShell } from '@/components/practice/PracticeShell';
import { PODIUM, RANKINGS, USER } from '@/lib/mockData';

export default function LeaderboardPage() {
  const [scope, setScope] = useState<'Global' | 'Friends'>('Global');
  const [find, setFind] = useState('');

  const rows = RANKINGS.filter((r) =>
    !find.trim() || r.name.toLowerCase().includes(find.toLowerCase()));

  const progress = (USER.xp / USER.xpToNextRank) * 100;

  return (
    <PracticeShell user={USER}>
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight
                         text-[var(--color-practice-deep)] mb-3">
            Hall of fame
          </h1>
          <p className="text-[var(--color-practice-ink-soft)] max-w-[52ch]">
            See how you stack up against the rest of the InterviewPro community.
          </p>
        </div>

        <div className="shrink-0 flex rounded-full p-1 bg-[var(--color-practice-sunken)]">
          {(['Global', 'Friends'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              className={`px-6 py-2 rounded-full text-sm font-semibold transition ${
                scope === s
                  ? 'bg-[var(--color-practice-surface)] text-[var(--color-practice-accent)] shadow-sm'
                  : 'text-[var(--color-practice-ink-soft)]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] mb-6">
        <section className="rounded-[var(--radius-panel)] p-7
                            bg-[var(--color-practice-sunken)]">
          <div className="flex items-center gap-5 mb-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-[var(--color-practice-accent)]
                              grid place-items-center text-white text-2xl font-bold">
                {USER.name.charAt(0)}
              </div>
              <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full grid place-items-center
                               text-xs font-bold text-white bg-[var(--color-practice-xp)]
                               ring-4 ring-[var(--color-practice-sunken)]">
                {USER.level}
              </span>
            </div>
            <div>
              <h2 className="text-2xl font-extrabold">{USER.name}</h2>
              <p className="text-[var(--color-practice-accent)] font-medium">{USER.track}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-6">
            <Stat label="Global rank" value={`#${USER.globalRank}`} />
            <Stat label="Current streak" value={`${USER.streak} days`} tone="xp" />
          </div>

          <div className="flex justify-between text-xs text-[var(--color-practice-ink-soft)] mb-2">
            <span>{USER.xp.toLocaleString()} XP</span>
            <span>{USER.xpToNextRank.toLocaleString()} XP to rank #{USER.globalRank - 1}</span>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--color-practice-surface)]">
            <div className="h-full rounded-full bg-[var(--color-practice-accent)]"
                 style={{ width: `${progress}%` }} />
          </div>
        </section>

        <section className="rounded-[var(--radius-panel)] p-6
                            bg-[var(--color-practice-surface)]
                            border border-[var(--color-practice-border)]">
          <h2 className="font-bold text-center mb-6">Top contenders</h2>
          <div className="flex items-end justify-center gap-3">
            {PODIUM.map((p) => {
              const h = p.place === 1 ? 'h-24' : p.place === 2 ? 'h-16' : 'h-12';
              const c = p.place === 1 ? 'var(--color-practice-xp)'
                      : p.place === 2 ? '#cbd5e1' : '#d9a066';
              return (
                <div key={p.place} className="flex-1 text-center">
                  <div className="w-11 h-11 mx-auto rounded-full mb-2 grid place-items-center
                                  text-white font-bold text-sm"
                       style={{ background: c }}>
                    {p.name.charAt(0)}
                  </div>
                  <div className="text-xs font-medium mb-2 truncate">{p.name}</div>
                  <div className={`${h} rounded-t-lg grid place-items-start justify-center pt-2
                                   font-extrabold text-white`}
                       style={{ background: c }}>
                    {p.place}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="rounded-[var(--radius-panel)] bg-[var(--color-practice-surface)]
                          border border-[var(--color-practice-border)] overflow-hidden">
        <div className="flex items-center justify-between gap-4 p-6
                        border-b border-[var(--color-practice-border)]">
          <h2 className="text-xl font-bold">Live rankings</h2>
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Find a user…"
            className="px-4 py-2 rounded-[var(--radius-control)] text-sm w-[240px]
                       bg-[var(--color-practice-bg)]
                       border border-[var(--color-practice-border)]
                       placeholder:text-[var(--color-practice-ink-mute)]"
          />
        </div>

        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-[var(--color-practice-ink-soft)]">
            Nobody by that name in this leaderboard.
          </p>
        ) : rows.map((r) => (
          <div key={r.rank}
               className={`flex items-center gap-4 px-6 py-4 border-b last:border-0
                           border-[var(--color-practice-border)] ${
                 r.you ? 'bg-[var(--color-practice-sunken)]' : ''}`}>
            <span className={`w-12 font-bold ${
              r.you ? 'text-[var(--color-practice-accent)]' : ''}`}>{r.rank}</span>
            <span className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold
                             bg-[var(--color-practice-sunken)]
                             text-[var(--color-practice-accent)]">
              {r.name.split(' ').map((n) => n[0]).join('')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">
                {r.name}{r.you && ' (you)'}
              </div>
              <div className="text-xs text-[var(--color-practice-ink-mute)]">{r.track}</div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-[11px] text-[var(--color-practice-ink-mute)]">Streak</div>
              <div className="text-sm font-semibold">{r.streak}</div>
            </div>
            <div className={`w-24 text-right font-bold ${
              r.you ? 'text-[var(--color-practice-accent)]' : ''}`}>
              {r.xp.toLocaleString()}
              <span className="text-[10px] font-normal text-[var(--color-practice-ink-mute)] ml-1">XP</span>
            </div>
          </div>
        ))}

        <button className="w-full py-4 text-sm font-medium text-[var(--color-practice-accent)]
                           hover:bg-[var(--color-practice-sunken)] transition">
          Load more rankings
        </button>
      </section>
    </PracticeShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'xp' }) {
  return (
    <div className="px-5 py-3 rounded-[var(--radius-control)]
                    bg-[var(--color-practice-surface)]">
      <div className="text-[11px] tracking-wide text-[var(--color-practice-ink-mute)]">{label}</div>
      <div className="text-lg font-extrabold"
           style={tone === 'xp' ? { color: 'var(--color-practice-xp)' } : undefined}>
        {value}
      </div>
    </div>
  );
}
