'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PracticeShell } from '@/components/practice/PracticeShell';
import { AuthGate } from '@/components/ui/AuthGate';
import { INTERVIEWS, ROLES, LANGS, type Difficulty } from '@/lib/mockData';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];

const DIFF_STYLE: Record<Difficulty, string> = {
  Easy:   'bg-[var(--color-practice-pass)] text-white',
  Medium: 'bg-[var(--color-practice-xp)] text-white',
  Hard:   'bg-[var(--color-practice-hard)] text-white',
};

export default function DiscoveryPage() {
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | 'All'>('All');
  const [role, setRole] = useState('All');
  const [language, setLanguage] = useState('All');

  // All four filters combine. The photo shows them as independent chip rows,
  // and independent means AND, not OR.
  const results = useMemo(() => INTERVIEWS.filter((i) => {
    if (difficulty !== 'All' && i.difficulty !== difficulty) return false;
    if (role !== 'All' && i.role !== role) return false;
    if (language !== 'All' && i.language !== language) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!`${i.title} ${i.blurb} ${i.skill} ${i.language}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [query, difficulty, role, language]);

  const filtered = difficulty !== 'All' || role !== 'All' || language !== 'All' || !!query.trim();
  const clear = () => { setQuery(''); setDifficulty('All'); setRole('All'); setLanguage('All'); };

  return (
    <AuthGate role="individual">
    <PracticeShell>
      <section className="rounded-[var(--radius-panel)] bg-[var(--color-practice-sunken)]
                          p-8 mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight mb-3">
          Discover mock interviews
        </h1>
        <p className="text-[var(--color-practice-ink-soft)] max-w-[58ch] mb-6">
          Find the right practice scenario, earn XP, and get ready for the interview
          you actually have coming up.
        </p>

        <div className="flex gap-2 max-w-[640px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by role, skill or language…"
            className="flex-1 px-4 py-3 rounded-[var(--radius-control)] text-sm
                       bg-[var(--color-practice-surface)]
                       border border-[var(--color-practice-border)]
                       placeholder:text-[var(--color-practice-ink-mute)]"
          />
          <button className="px-5 rounded-[var(--radius-control)] text-white
                             bg-[var(--color-practice-accent)] hover:brightness-110 transition">
            Search
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-sm text-[var(--color-practice-ink-mute)] mr-1">Filters</span>

        <Chip on={difficulty === 'All'} onClick={() => setDifficulty('All')}>All</Chip>
        {DIFFICULTIES.map((d) => (
          <Chip key={d} on={difficulty === d} onClick={() => setDifficulty(d)}>{d}</Chip>
        ))}

        <span className="w-px h-6 bg-[var(--color-practice-border)] mx-2" />

        <Select value={role} onChange={setRole} options={ROLES} label="Role" />
        <Select value={language} onChange={setLanguage} options={LANGS} label="Language" />

        {filtered && (
          <button onClick={clear}
                  className="ml-auto text-sm text-[var(--color-practice-accent)] hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed
                        border-[var(--color-practice-border)] p-12 text-center">
          <p className="font-semibold mb-2">Nothing matches those filters</p>
          <p className="text-sm text-[var(--color-practice-ink-soft)] mb-5">
            Try widening the role or language.
          </p>
          <button onClick={clear}
                  className="px-4 py-2 rounded-[var(--radius-control)] text-sm text-white
                             bg-[var(--color-practice-accent)]">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((i) => (
            <article key={i.id}
              className="rounded-[var(--radius-card)] bg-[var(--color-practice-surface)]
                         border border-[var(--color-practice-border)] p-5 flex flex-col
                         shadow-[0_4px_20px_rgba(15,23,42,0.05)] hover:-translate-y-0.5
                         hover:shadow-[0_8px_28px_rgba(15,23,42,0.09)] transition">
              <div className="flex items-start justify-between mb-4">
                <span className="w-10 h-10 rounded-[var(--radius-control)] grid place-items-center
                                 bg-[var(--color-practice-sunken)]
                                 text-[var(--color-practice-accent)] text-xs font-bold">
                  {i.skill.slice(0, 2).toUpperCase()}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold
                                  ${DIFF_STYLE[i.difficulty]}`}>
                  {i.difficulty}
                </span>
              </div>

              <h2 className="text-lg font-bold leading-snug mb-2">{i.title}</h2>
              <p className="text-sm text-[var(--color-practice-ink-soft)] mb-5 line-clamp-2">
                {i.blurb}
              </p>

              <div className="mt-auto pt-4 border-t border-[var(--color-practice-border)]
                              flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold
                                 bg-[color-mix(in_srgb,var(--color-practice-xp)_16%,transparent)]
                                 text-[var(--color-practice-ink)]">
                  +{i.xp} XP
                </span>
                <span className="text-xs text-[var(--color-practice-ink-mute)]">
                  {i.minutes} min
                </span>
                <Link
                  href={`/arena-preview?id=${i.id}`}
                  aria-label={`Start ${i.title}`}
                  className="ml-auto w-9 h-9 rounded-full grid place-items-center text-white
                             bg-[var(--color-practice-accent)] hover:brightness-110 transition"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </PracticeShell>
    </AuthGate>
  );
}

function Chip({ on, onClick, children }:
  { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
        on
          ? 'bg-[var(--color-practice-accent)] text-white border-transparent'
          : 'bg-[var(--color-practice-surface)] text-[var(--color-practice-ink-soft)] border-[var(--color-practice-border)] hover:border-[var(--color-practice-accent)]'
      }`}
    >
      {children}
    </button>
  );
}

function Select({ value, onChange, options, label }:
  { value: string; onChange: (v: string) => void; options: string[]; label: string }) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-4 py-1.5 rounded-full text-sm bg-[var(--color-practice-surface)]
                   border border-[var(--color-practice-border)]
                   text-[var(--color-practice-ink-soft)]"
      >
        <option value="All">{label}: all</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
