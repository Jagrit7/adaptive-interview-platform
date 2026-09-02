'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The enterprise console chrome: fixed left sidebar, serif page titles, a
 * black primary action. Taken from the pipeline, dashboard and evaluation
 * report photos, which share it exactly.
 *
 * Deliberately a different temperature from PracticeShell. Same brand, two
 * jobs — one is a habit product, the other is a tool people work in all day.
 * The serif headings and the near-black actions are what separate them.
 */

const NAV = [
  { href: '/enterprise',           label: 'Dashboard',  icon: GridIcon },
  { href: '/enterprise/templates', label: 'Interviews', icon: DocIcon },
  { href: '/enterprise/pipeline',  label: 'Candidates', icon: PeopleIcon },
  { href: '/enterprise/team',      label: 'Team',       icon: TeamIcon },
];

export function ConsoleShell({
  title, subtitle, actions, breadcrumb, children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumb?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex bg-[var(--color-console-bg)]
                    text-[var(--color-console-ink)]">
      <aside className="hidden lg:flex w-[264px] shrink-0 flex-col
                        border-r border-[var(--color-console-border)]
                        bg-[var(--color-console-surface)]">
        <div className="px-6 py-6">
          <Link href="/" className="block">
            <span className="font-serif text-2xl font-bold tracking-tight">InterviewPro</span>
            <span className="block text-[10px] tracking-[0.18em] mt-0.5
                             text-[var(--color-console-ink-mute)]">
              ENTERPRISE SUITE
            </span>
          </Link>
        </div>

        <div className="px-4 pb-6">
          <Link
            href="/builder"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg
                       text-sm font-semibold text-white
                       bg-[var(--color-console-accent)] hover:brightness-150 transition"
          >
            <span aria-hidden="true">+</span> New interview
          </Link>
        </div>

        <nav className="px-3 space-y-1">
          {NAV.map((n) => {
            const on = pathname === n.href ||
                       (n.href !== '/enterprise' && pathname.startsWith(n.href));
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm
                            transition ${
                  on
                    ? 'bg-[var(--color-console-bg)] font-semibold'
                    : 'text-[var(--color-console-ink-soft)] hover:bg-[var(--color-console-bg)]'
                }`}
              >
                {on && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full
                                   bg-[var(--color-console-accent)]" aria-hidden="true" />
                )}
                <Icon />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-3 pb-6 pt-6 border-t border-[var(--color-console-border)]">
          <Link href="/enterprise/settings"
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm
                           text-[var(--color-console-ink-soft)]
                           hover:bg-[var(--color-console-bg)]">
            <CogIcon /> Settings
          </Link>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 flex items-center gap-4 px-8
                           border-b border-[var(--color-console-border)]
                           bg-[var(--color-console-surface)]">
          {breadcrumb && (
            <span className="text-[11px] tracking-[0.12em]
                             text-[var(--color-console-ink-mute)]">
              {breadcrumb}
            </span>
          )}
          <input
            placeholder="Search candidates, interviews…"
            className="ml-auto w-[320px] px-4 py-2 rounded-lg text-sm
                       bg-[var(--color-console-bg)]
                       border border-[var(--color-console-border)]
                       placeholder:text-[var(--color-console-ink-mute)]"
          />
        </header>

        <main className="flex-1 px-8 py-8 overflow-x-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="font-serif text-4xl font-bold tracking-tight">{title}</h1>
              {subtitle && (
                <p className="mt-2 text-[var(--color-console-ink-soft)] max-w-[64ch]">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export function ConsoleButton({
  children, variant = 'solid', onClick,
}: { children: React.ReactNode; variant?: 'solid' | 'ghost'; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
        variant === 'solid'
          ? 'bg-[var(--color-console-accent)] text-white hover:brightness-150'
          : 'bg-[var(--color-console-surface)] border border-[var(--color-console-border)] hover:bg-[var(--color-console-bg)]'
      }`}
    >
      {children}
    </button>
  );
}

export function ConsoleCard({
  title, children, className = '',
}: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-[var(--color-console-surface)]
                         border border-[var(--color-console-border)] p-6 ${className}`}>
      {title && <h2 className="font-serif text-xl font-bold mb-4">{title}</h2>}
      {children}
    </section>
  );
}

/** Status pill. Tone carries meaning; the dot repeats it for anyone who
 *  cannot separate the hues. */
export function StatusPill({ tone, children }:
  { tone: 'active' | 'draft' | 'done'; children: React.ReactNode }) {
  const map = {
    active: ['#e0edff', '#1d4ed8'],
    draft:  ['#eceef0', '#45464d'],
    done:   ['#dcfce7', '#15803d'],
  }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: map[0], color: map[1] }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: map[1] }} aria-hidden="true" />
      {children}
    </span>
  );
}

const s = 'w-[18px] h-[18px]';
const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const };
function GridIcon()   { return <svg className={s} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function DocIcon()    { return <svg className={s} viewBox="0 0 24 24" {...p}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>; }
function PeopleIcon() { return <svg className={s} viewBox="0 0 24 24" {...p}><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0-2-5.2M21 20a5 5 0 0 0-4-4.9"/></svg>; }
function TeamIcon()   { return <svg className={s} viewBox="0 0 24 24" {...p}><circle cx="7" cy="9" r="2.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2 19a5 5 0 0 1 10 0M12 19a5 5 0 0 1 10 0"/></svg>; }
function CogIcon()    { return <svg className={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>; }
