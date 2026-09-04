'use client';

/**
 * The one and only rendering of a finished interview report.
 *
 * Lifted out of `components/console/EnterpriseReports.tsx`, where it was the
 * private `ReportDetail`. Three surfaces now show a report - the stored
 * enterprise report page, a candidate's published-interview result, and the
 * throwaway report at the end of a test run - and the requirement is that they
 * look identical, because they *are* the same evaluation. Keeping one component
 * is the only version of that which stays true after the next design change.
 *
 * It renders a plain object, not a database row. The ephemeral test report
 * never touches Supabase, so anything that fetches would rule it out as a
 * caller; `record` is assembled in memory there and read from a row here.
 */

import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { ConsoleCard } from '@/components/console/ConsoleShell';
import type { ReportRecord } from '@/lib/reports';

export const percent = (value: number | null) => (value === null ? '—' : String(Math.round(value * 100)));
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'CA';

export function InterviewReportView({ record }: { record: ReportRecord }) {
  const report = record.report;
  const skills = report.competencies.map(item => [item.name, Math.round(item.score * 100)] as [string, number]);
  const agents = report.agents;
  const started = Date.parse(report.started_at);
  const finished = Date.parse(report.finished_at);
  const duration = Number.isFinite(started) && Number.isFinite(finished)
    ? Math.max(0, Math.round((finished - started) / 60000))
    : 0;

  return (
    <>
      <ConsoleCard className="p-7">
        <div className="grid items-center gap-7 lg:grid-cols-[1fr_1.15fr]">
          <div className="flex items-center gap-5">
            <span className="grid size-28 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#dce6f3] to-[#acbdd2] font-serif text-3xl font-bold">
              {initials(record.candidate_name)}
            </span>
            <div>
              <h1 className="font-serif text-4xl font-bold">{record.candidate_name || 'Unnamed candidate'}</h1>
              <p className="mt-1 text-lg text-[#555a62]">{record.role_name || record.panel_name}<br />Candidate</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <StatusPillLocal tone={record.band === 'Strong' ? 'green' : 'blue'}>
                  {record.recommendation.toUpperCase()}
                </StatusPillLocal>
                <span className="rounded-md bg-[#eff1f3] px-3 py-1.5 text-xs font-semibold">{record.candidate_ref}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-[#eceef0] p-6">
            <div className="grid items-center gap-5 sm:grid-cols-[130px_1fr]">
              <div className="border-r border-[#cbd0d5] pr-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#5f646c]">Overall Score</p>
                <strong className="mt-2 block font-serif text-5xl">
                  {percent(record.overall_score)}<small className="text-lg font-normal">/100</small>
                </strong>
              </div>
              <div className="space-y-4">
                {agents.map(agent => {
                  const score = agent.score ?? 0;
                  return (
                    <div key={agent.agent_id} className="grid grid-cols-[140px_1fr_40px] items-center gap-3 text-sm">
                      <span className="truncate">
                        <b>{agent.name}</b>
                        <small className="block text-[10px] text-[#737880]">
                          {agent.weight === undefined ? 'Legacy scoring' : `${Math.round(agent.weight * 100)}% weight`}
                          {' · '}{Math.round(agent.satisfaction * 100)}% assessment confidence
                        </small>
                      </span>
                      <div className="h-2 rounded bg-white">
                        <div className="h-2 rounded bg-black" style={{ width: `${Math.round(score * 100)}%` }} />
                      </div>
                      <b>{Math.round(score * 100)}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </ConsoleCard>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_350px]">
        <div className="space-y-5">
          <ConsoleCard className="p-7">
            <h2 className="font-serif text-2xl font-bold">Executive Summary</h2>
            <p className="mt-5 text-[15px] leading-7 text-[#50555d]">{record.executive_summary}</p>
          </ConsoleCard>
          <div className="grid gap-5 md:grid-cols-2">
            <EvidenceCard title="Key Strengths" items={record.strengths} strength />
            <EvidenceCard title="Growth Areas" items={record.growth_areas} />
          </div>
          <ConsoleCard className="p-7">
            <h2 className="font-serif text-xl font-bold">Interview details</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              {([
                ['Duration', `${duration} minutes`],
                ['Questions', `${report.totals.questions_answered} answered`],
                ['Completion', record.completed ? 'Completed' : 'Ended early'],
                ['Language', report.language],
              ] as [string, string][]).map(item => (
                <div key={item[0]} className="flex justify-between border-b border-[#e6e8eb] pb-3">
                  <dt className="text-[#747981]">{item[0]}</dt>
                  <dd className="font-semibold">{item[1]}</dd>
                </div>
              ))}
            </dl>
          </ConsoleCard>
        </div>
        <ConsoleCard className="p-7">
          <h2 className="text-center font-serif text-2xl font-bold">Skill Matrix</h2>
          <div className="mt-10"><SkillRadar skills={skills} /></div>
        </ConsoleCard>
      </div>
    </>
  );
}

// Imported lazily-by-copy rather than from ConsoleShell so this component can be
// mounted inside the candidate-facing interview window, which does not pull in
// the enterprise console shell.
function StatusPillLocal({ tone, children }: { tone: 'green' | 'blue' | 'amber'; children: React.ReactNode }) {
  const palette = {
    green: 'bg-[#e4f4e8] text-[#256134]',
    blue: 'bg-[#e2ecfb] text-[#1d4a86]',
    amber: 'bg-[#fbf0dd] text-[#7a5310]',
  }[tone];
  return <span className={`inline-flex rounded-md px-3 py-1.5 text-xs font-semibold ${palette}`}>{children}</span>;
}

function EvidenceCard({ title, items, strength = false }: { title: string; items: string[]; strength?: boolean }) {
  return (
    <ConsoleCard className={`${strength ? 'border-t-[3px] border-t-black' : ''} p-6`}>
      <h2 className="text-xs font-semibold uppercase tracking-[.16em] text-[#555a62]">{title}</h2>
      <ul className="mt-5 space-y-4">
        {items.map(item => (
          <li key={item} className="flex gap-3 text-sm leading-6">
            {strength ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <ArrowRight size={18} className="mt-0.5 shrink-0" />}
            {item}
          </li>
        ))}
      </ul>
    </ConsoleCard>
  );
}

function SkillRadar({ skills }: { skills: [string, number][] }) {
  if (!skills.length) return <p className="text-center text-sm text-[#777c84]">No competency scores were recorded.</p>;
  const points = skills.map(([, score], index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / skills.length;
    const radius = score * .95;
    return `${120 + Math.cos(angle) * radius},${120 + Math.sin(angle) * radius}`;
  }).join(' ');
  return (
    <div>
      <svg viewBox="0 0 240 240" className="mx-auto w-full max-w-[250px]" aria-label="Candidate skill matrix">
        {[95, 68, 40].map(radius => <circle key={radius} cx="120" cy="120" r={radius} fill="none" stroke="#d9dde2" />)}
        {skills.map((_, index) => {
          const angle = -Math.PI / 2 + index * Math.PI * 2 / skills.length;
          return <line key={index} x1="120" y1="120" x2={120 + Math.cos(angle) * 95} y2={120 + Math.sin(angle) * 95} stroke="#d9dde2" />;
        })}
        <polygon points={points} fill="rgba(0,0,0,.08)" stroke="#111" strokeWidth="2" />
      </svg>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {skills.map(([skill, score]) => (
          <span key={skill} className="rounded border border-[#d8dce1] bg-[#f7f8fa] px-2 py-1 text-xs font-semibold">
            {skill} · {score}
          </span>
        ))}
      </div>
    </div>
  );
}
