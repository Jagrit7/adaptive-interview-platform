'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ConsoleShell, ConsoleCard, ConsoleButton } from '@/components/console/ConsoleShell';
import { CANDIDATES } from '@/lib/mockData';

const STATUS_TONE: Record<string, [string, string]> = {
  'Technical round': ['#e0edff', '#1d4ed8'],
  'Screening':       ['#eceef0', '#45464d'],
  'Completed':       ['#dcfce7', '#15803d'],
};

const ROLES = Array.from(new Set(CANDIDATES.map((c) => c.role)));
const STATUSES = Array.from(new Set(CANDIDATES.map((c) => c.status)));

export default function PipelinePage() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('All');
  const [status, setStatus] = useState('All');

  const rows = useMemo(() => CANDIDATES.filter((c) => {
    if (role !== 'All' && c.role !== role) return false;
    if (status !== 'All' && c.status !== status) return false;
    if (q.trim() && !`${c.name} ${c.email}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [q, role, status]);

  return (
    <ConsoleShell
      breadcrumb="CANDIDATES"
      title="Candidate Pipeline"
      subtitle="Review and manage candidates across every active role."
      actions={<ConsoleButton variant="ghost">Export CSV</ConsoleButton>}
    >
      <ConsoleCard className="p-0 overflow-hidden">
        <div className="p-6 border-b border-[var(--color-console-border)]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search candidates by name or email…"
            className="w-full px-4 py-3 rounded-lg text-sm
                       bg-[var(--color-console-bg)]
                       border border-[var(--color-console-border)]
                       placeholder:text-[var(--color-console-ink-mute)]"
          />
          <div className="flex flex-wrap gap-3 mt-4">
            <Filter value={role} onChange={setRole} options={ROLES} label="All roles" />
            <Filter value={status} onChange={setStatus} options={STATUSES} label="All statuses" />
            {(role !== 'All' || status !== 'All' || q) && (
              <button onClick={() => { setQ(''); setRole('All'); setStatus('All'); }}
                      className="text-sm text-[var(--color-console-ink-soft)] hover:underline">
                Clear
              </button>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-14 text-center">
            <p className="font-serif text-xl font-bold mb-2">No candidates match</p>
            <p className="text-sm text-[var(--color-console-ink-soft)]">
              Widen the role or status filter to see more.
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] tracking-[0.1em]
                               text-[var(--color-console-ink-mute)]
                               border-b border-[var(--color-console-border)]
                               bg-[var(--color-console-bg)]">
                  <th className="px-6 py-3 font-medium">CANDIDATE</th>
                  <th className="px-6 py-3 font-medium">ROLE APPLIED</th>
                  <th className="px-6 py-3 font-medium">STATUS</th>
                  <th className="px-6 py-3 font-medium">AI SCORE</th>
                  <th className="px-6 py-3 font-medium text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const tone = STATUS_TONE[c.status];
                  return (
                    <tr key={c.id} className="border-b last:border-0
                                              border-[var(--color-console-border)]
                                              hover:bg-[var(--color-console-bg)]">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="w-10 h-10 rounded-lg grid place-items-center
                                           text-xs font-bold
                                           bg-[var(--color-console-tint)]">
                            {c.name.split(' ').map((n) => n[0]).join('')}
                          </span>
                          <div>
                            <div className="font-semibold">{c.name}</div>
                            <div className="text-xs text-[var(--color-console-ink-mute)]">
                              {c.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[var(--color-console-ink-soft)]">{c.role}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1
                                         rounded-full text-xs font-medium"
                              style={{ background: tone[0], color: tone[1] }}>
                          <span className="w-1.5 h-1.5 rounded-full"
                                style={{ background: tone[1] }} aria-hidden="true" />
                          {c.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {c.score === null ? (
                          <span className="inline-grid place-items-center w-11 h-9 rounded-lg
                                           text-[var(--color-console-ink-mute)]
                                           border border-dashed border-[var(--color-console-border)]">
                            —
                          </span>
                        ) : (
                          <span className="inline-grid place-items-center w-11 h-9 rounded-lg
                                           font-bold border"
                                style={{
                                  borderColor: c.score >= 90 ? '#15803d' : 'var(--color-console-border)',
                                  color: c.score >= 90 ? '#15803d' : 'inherit',
                                }}>
                            {c.score}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {c.status === 'Completed' ? (
                          <Link href="/enterprise/report">
                            <ConsoleButton>View report</ConsoleButton>
                          </Link>
                        ) : (
                          <ConsoleButton variant="ghost">View details</ConsoleButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex items-center justify-between px-6 py-4 text-sm
                            border-t border-[var(--color-console-border)]
                            text-[var(--color-console-ink-soft)]">
              <span>Showing {rows.length} of {CANDIDATES.length} candidates</span>
              <div className="flex gap-1">
                {['1', '2', '3'].map((n) => (
                  <button key={n}
                          className={`w-9 h-9 rounded-lg border text-sm ${
                    n === '1'
                      ? 'border-[var(--color-console-accent)] font-semibold'
                      : 'border-[var(--color-console-border)]'
                  }`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </ConsoleCard>
    </ConsoleShell>
  );
}

function Filter({ value, onChange, options, label }:
  { value: string; onChange: (v: string) => void; options: string[]; label: string }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
              className="px-4 py-2 rounded-lg text-sm bg-[var(--color-console-surface)]
                         border border-[var(--color-console-border)]">
        <option value="All">{label}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
