'use client';

import Link from 'next/link';
import { ConsoleShell, ConsoleCard, ConsoleButton, StatusPill } from '@/components/console/ConsoleShell';
import { CONFIGS } from '@/lib/mockData';

export default function EnterpriseDashboard() {
  return (
    <ConsoleShell
      breadcrumb="RECRUITER CONSOLE"
      title="Interview Builder"
      subtitle="Design, configure and deploy your own interview panels."
      actions={<Link href="/builder"><ConsoleButton>+ Create new interview</ConsoleButton></Link>}
    >
      <div className="grid gap-5 lg:grid-cols-3 mb-8">
        <ConsoleCard>
          <Metric label="CANDIDATE COMPLETION" value="75%" delta="+2.4%" />
          <p className="text-sm text-[var(--color-console-ink-soft)] mt-3">
            Average completion across active configurations.
          </p>
          <div className="mt-6 h-1.5 rounded-full bg-[var(--color-console-bg)]">
            <div className="h-full w-[75%] rounded-full bg-[var(--color-console-accent)]" />
          </div>
        </ConsoleCard>

        <ConsoleCard>
          <Metric label="AVERAGE SCORE" value="68" suffix="/ 100" />
          <p className="text-sm text-[var(--color-console-ink-soft)] mt-3">
            Technical baseline across this quarter&apos;s hiring.
          </p>
          <div className="mt-6 flex items-end gap-1.5 h-12" aria-hidden="true">
            {[30, 45, 90, 55, 25].map((h, i) => (
              <div key={i} className="flex-1 rounded-sm"
                   style={{ height: `${h}%`,
                            background: i === 2 ? 'var(--color-console-tint)' : '#eceef0' }} />
            ))}
          </div>
        </ConsoleCard>

        <ConsoleCard title="Builder preview">
          <ol className="space-y-4">
            {[
              ['Interview details', 'Title, duration and context', 'done'],
              ['Role and skills',   'Define core competencies',    'current'],
              ['AI configuration',  'Set strictness and persona',  'todo'],
            ].map(([t, d, state]) => (
              <li key={t} className="flex gap-3">
                <span className={`mt-0.5 w-4 h-4 rounded-full shrink-0 border-2 ${
                  state === 'done'    ? 'bg-[var(--color-console-accent)] border-[var(--color-console-accent)]' :
                  state === 'current' ? 'border-[var(--color-console-accent)]' :
                                        'border-[var(--color-console-border)] bg-[var(--color-console-bg)]'
                }`} />
                <div>
                  <div className={`text-sm ${state === 'todo'
                    ? 'text-[var(--color-console-ink-mute)]' : 'font-semibold'}`}>{t}</div>
                  <div className="text-xs text-[var(--color-console-ink-mute)]">{d}</div>
                </div>
              </li>
            ))}
          </ol>
        </ConsoleCard>
      </div>

      <ConsoleCard className="p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-4 p-6
                        border-b border-[var(--color-console-border)]">
          <h2 className="font-serif text-xl font-bold">Active configurations</h2>
          <input placeholder="Search configs…"
                 className="px-4 py-2 rounded-lg text-sm w-[240px]
                            bg-[var(--color-console-bg)]
                            border border-[var(--color-console-border)]" />
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] tracking-[0.1em]
                           text-[var(--color-console-ink-mute)]
                           border-b border-[var(--color-console-border)]">
              <th className="px-6 py-3 font-medium">INTERVIEW NAME</th>
              <th className="px-6 py-3 font-medium">TARGET ROLE</th>
              <th className="px-6 py-3 font-medium">STATUS</th>
              <th className="px-6 py-3 font-medium">LAST MODIFIED</th>
              <th className="px-6 py-3 font-medium text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {CONFIGS.map((c) => (
              <tr key={c.id} className="border-b last:border-0
                                        border-[var(--color-console-border)]
                                        hover:bg-[var(--color-console-bg)]">
                <td className="px-6 py-4 font-medium">{c.name}</td>
                <td className="px-6 py-4 text-[var(--color-console-ink-soft)]">{c.role}</td>
                <td className="px-6 py-4">
                  <StatusPill tone={c.status}>
                    {c.status === 'active' ? 'Active' : c.status === 'draft' ? 'Draft' : 'Completed'}
                  </StatusPill>
                </td>
                <td className="px-6 py-4 text-[var(--color-console-ink-soft)]">{c.modified}</td>
                <td className="px-6 py-4 text-right">
                  <Link href="/builder"
                        className="text-[var(--color-console-ink-soft)] hover:underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ConsoleCard>
    </ConsoleShell>
  );
}

function Metric({ label, value, suffix, delta }:
  { label: string; value: string; suffix?: string; delta?: string }) {
  return (
    <>
      <div className="text-[11px] tracking-[0.1em] text-[var(--color-console-ink-mute)]">
        {label}
      </div>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="font-serif text-5xl font-bold">{value}</span>
        {suffix && <span className="text-[var(--color-console-ink-mute)]">{suffix}</span>}
        {delta && <span className="text-sm text-[#15803d]">{delta}</span>}
      </div>
    </>
  );
}
