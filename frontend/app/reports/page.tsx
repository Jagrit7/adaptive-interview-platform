'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/ui/AuthGate';
import { ConsoleShell, ConsoleCard, ConsoleButton } from '@/components/console/ConsoleShell';
import {
  listReports,
  loadReport,
  type InterviewReport,
  type ReportSummary,
} from '@/lib/reports';

export default function ReportsPage() {
  return (
    <AuthGate>
      <Reports />
    </AuthGate>
  );
}

const BAND_COLOR: Record<string, string> = {
  'Strong': 'var(--accent-teal)',
  'Solid': 'var(--accent-indigo)',
  'Developing': 'var(--accent-amber)',
  'Needs work': 'var(--accent-rose)',
};

function Reports() {
  const router = useRouter();
  const [rows, setRows] = useState<ReportSummary[]>([]);
  const [open, setOpen] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setRows(await listReports()); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return r.candidate_name.toLowerCase().includes(q) || r.candidate_ref.toLowerCase().includes(q);
  });

  if (open) return <ReportDetail report={open} onBack={() => setOpen(null)} />;

  return (
    <ConsoleShell
      breadcrumb="CANDIDATES"
      title="Candidate Pipeline"
      subtitle="Every interview conducted with your panels."
    >
      <ConsoleCard className="p-0 overflow-hidden">
        <div className="p-6 border-b border-[var(--color-console-border)]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by candidate name or reference code…"
            className="w-full px-4 py-3 rounded-lg text-sm
                       bg-[var(--color-console-bg)]
                       border border-[var(--color-console-border)]
                       placeholder:text-[var(--color-console-ink-mute)]"
          />
        </div>

        {error && (
          <p className="px-6 py-4 text-sm text-[#dc2626]">{error}</p>
        )}
        {loading && (
          <p className="px-6 py-6 text-sm text-[var(--color-console-ink-mute)]">Loading…</p>
        )}

        {!loading && filtered.length === 0 && !error && (
          <div className="p-14 text-center">
            <p className="font-serif text-xl font-bold mb-2">
              {rows.length === 0 ? 'No interviews yet' : 'Nothing matches that search'}
            </p>
            <p className="text-sm text-[var(--color-console-ink-soft)]">
              {rows.length === 0
                ? 'Reports appear here once a candidate finishes an interview.'
                : 'Try a different name or reference code.'}
            </p>
          </div>
        )}

        {filtered.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] tracking-[0.1em]
                             text-[var(--color-console-ink-mute)]
                             border-b border-[var(--color-console-border)]
                             bg-[var(--color-console-bg)]">
                <th className="px-6 py-3 font-medium">CANDIDATE</th>
                <th className="px-6 py-3 font-medium">PANEL</th>
                <th className="px-6 py-3 font-medium">DATE</th>
                <th className="px-6 py-3 font-medium">SCORE</th>
                <th className="px-6 py-3 font-medium text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0
                                          border-[var(--color-console-border)]
                                          hover:bg-[var(--color-console-bg)]">
                  <td className="px-6 py-4">
                    <div className="font-semibold">
                      {r.candidate_name || 'Unnamed candidate'}
                    </div>
                    <div className="text-xs font-mono text-[var(--color-console-ink-mute)]">
                      {r.candidate_ref}{!r.completed && ' · ended early'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[var(--color-console-ink-soft)]">
                    {r.panel_name}
                  </td>
                  <td className="px-6 py-4 text-[var(--color-console-ink-soft)]">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-grid place-items-center w-12 h-9 rounded-lg
                                     font-bold border border-[var(--color-console-border)]">
                      {r.overall_score !== null ? Math.round(r.overall_score * 100) : '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={async () => {
                        try { setOpen(await loadReport(r.id)); }
                        catch (err) { setError(err instanceof Error ? err.message : String(err)); }
                      }}
                      className="px-5 py-2.5 rounded-lg text-sm font-semibold
                                 bg-[var(--color-console-accent)] text-white
                                 hover:brightness-150 transition"
                    >
                      View report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ConsoleCard>
    </ConsoleShell>
  );
}

function ReportDetail({ report, onBack }: { report: InterviewReport; onBack: () => void }) {
  const t = report.totals;
  return (
    <ConsoleShell
      breadcrumb="CANDIDATES › EVALUATION REPORT"
      title={report.candidate_name || 'Unnamed candidate'}
      subtitle={`${report.candidate_ref} · ${report.panel_name} · ${new Date(report.started_at).toLocaleString()}${report.completed ? '' : ' · ended early'}`}
      actions={<ConsoleButton variant="ghost" onClick={onBack}>← All reports</ConsoleButton>}
    >
      <ConsoleCard className="mb-6">
        <div className="flex flex-wrap items-center gap-8">
          <div>
            <div className="text-[11px] tracking-[0.1em] text-[var(--color-console-ink-mute)]">
              OVERALL SCORE
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-serif text-5xl font-bold">
                {Math.round(t.overall_score * 100)}
              </span>
              <span className="text-[var(--color-console-ink-mute)]">/100</span>
              <span className="ml-3 px-3 py-1 rounded-lg text-xs font-medium
                               bg-[var(--color-console-bg)]">{t.band}</span>
            </div>
          </div>

          <div className="w-px self-stretch bg-[var(--color-console-border)]" />

          <div className="flex gap-10 text-sm">
            <Fig label="Competencies covered"
                 value={`${t.competencies_covered} / ${t.competencies_total}`} />
            <Fig label="Questions answered" value={String(t.questions_answered)} />
            {t.knowledge_coverage !== null && (
              <Fig label="Against ideal answers"
                   value={`${Math.round(t.knowledge_coverage * 100)}%`} />
            )}
          </div>
        </div>
      </ConsoleCard>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <ConsoleCard title="Competency checklist">
            <div className="space-y-4">
              {report.competencies.map((c) => (
                <div key={c.name}>
                  <div className="flex items-center gap-3 text-sm mb-1.5">
                    <span className={`w-4 h-4 rounded grid place-items-center text-[10px] border
                      ${c.covered
                        ? 'bg-[#dcfce7] border-[#15803d] text-[#15803d]'
                        : 'border-[var(--color-console-border)]'}`}>
                      {c.covered ? '✓' : ''}
                    </span>
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-auto font-mono">{c.score.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--color-console-border)] ml-7">
                    <div className="h-full rounded-full"
                         style={{ width: `${Math.min(100, c.score * 100)}%`,
                                  background: c.covered ? '#15803d' : 'var(--color-console-ink-mute)' }} />
                  </div>
                  <div className="ml-7 mt-1 text-xs text-[var(--color-console-ink-mute)]">
                    needs {c.threshold.toFixed(2)} · weight {c.weight}
                    {c.checked_by.length > 0 && ` · asked by ${c.checked_by.join(', ')}`}
                    {c.used_default_rule && ' · no rule set, default applied'}
                  </div>
                </div>
              ))}
            </div>
          </ConsoleCard>

          <ConsoleCard title="Transcript">
            <div className="space-y-4 max-h-[520px] overflow-y-auto">
              {report.transcript.map((turn) => (
                <div key={turn.turn}
                     className="pl-4 border-l-2"
                     style={{ borderColor: turn.speaker === 'candidate'
                       ? 'var(--color-console-border)' : 'var(--color-console-accent)' }}>
                  <div className="text-[11px] text-[var(--color-console-ink-mute)] mb-1">
                    {turn.speaker === 'candidate' ? 'Candidate' : turn.agent_name}
                    {turn.coverage !== null && ` · covered ${Math.round(turn.coverage * 100)}%`}
                    {turn.flags.length > 0 && ` · ${turn.flags.join(', ')}`}
                  </div>
                  <p className="text-sm leading-relaxed text-[var(--color-console-ink-soft)]">
                    {turn.text}
                  </p>
                </div>
              ))}
            </div>
          </ConsoleCard>
        </div>

        <div className="space-y-6">
          <ConsoleCard title="By interviewer">
            <div className="space-y-4 text-sm">
              {report.agents.map((a) => (
                <div key={a.agent_id} className="pb-4 border-b last:border-0 last:pb-0
                                                 border-[var(--color-console-border)]">
                  <div className="font-semibold">
                    {a.name}{a.force_closed && ' *'}
                  </div>
                  <div className="text-xs text-[var(--color-console-ink-mute)] mb-2">{a.role}</div>
                  <div className="flex justify-between text-xs">
                    <span>{a.questions_answered} answered · {a.visits} visit{a.visits === 1 ? '' : 's'}</span>
                    <span className="font-semibold">{Math.round(a.satisfaction * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
            {report.agents.some((a) => a.force_closed) && (
              <p className="mt-4 text-xs text-[var(--color-console-ink-mute)]">
                * ran out of visits without covering everything.
              </p>
            )}
          </ConsoleCard>

          <p className="text-xs leading-relaxed text-[var(--color-console-ink-mute)]">
            Scores come from an AI grading each answer, in some cases against reference
            answers you supplied. Useful as structured signal; not a validated hiring
            instrument.
          </p>
        </div>
      </div>
    </ConsoleShell>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] tracking-[0.1em] text-[var(--color-console-ink-mute)]">
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
