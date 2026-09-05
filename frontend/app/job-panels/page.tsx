import { PracticeShell } from '@/components/practice/PracticeShell';
import { AuthGate } from '@/components/ui/AuthGate';

const JOB_PANELS = [
  {
    name: 'Software Development Engineer',
    shortName: 'SDE',
    description: 'A complete software-engineering panel with coding, architecture, and behavioural rounds.',
    duration: '75 min',
    interviewers: 3,
    status: 'Available',
    stages: ['DSA & coding', 'System design', 'HR & communication'],
  },
  {
    name: 'Civil Services Examination',
    shortName: 'UPSC',
    description: 'A structured panel for knowledge, judgement, current affairs, and communication.',
    duration: 'Coming later',
    interviewers: null,
    status: 'Planned',
    stages: ['Knowledge', 'Situational judgement', 'Personality'],
  },
] as const;

export default function JobPanelsPage() {
  return (
    <AuthGate role="individual">
      <PracticeShell>
        <section className="rounded-[var(--radius-panel)] bg-[var(--color-practice-sunken)] p-8 mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-practice-accent)] mb-3">
            Interview by role
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight mb-3">
            Practice the complete interview, not just one skill
          </h1>
          <p className="max-w-[62ch] text-[var(--color-practice-ink-soft)]">
            Choose a prebuilt panel designed around the rounds used for a specific job or examination.
          </p>
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          {JOB_PANELS.map((panel) => {
            const available = panel.status === 'Available';
            return (
              <article
                key={panel.shortName}
                className={`rounded-[var(--radius-card)] border p-6 bg-[var(--color-practice-surface)]
                            shadow-[0_4px_20px_rgba(15,23,42,0.05)] ${
                  available
                    ? 'border-[var(--color-practice-border)]'
                    : 'border-dashed border-[var(--color-practice-border)] opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="w-12 h-12 rounded-[var(--radius-control)] grid place-items-center
                                  bg-[var(--color-practice-sunken)] text-[var(--color-practice-accent)]
                                  font-extrabold text-sm">
                    {panel.shortName}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    available
                      ? 'bg-[color-mix(in_srgb,var(--color-practice-pass)_16%,transparent)] text-[var(--color-practice-pass)]'
                      : 'bg-[var(--color-practice-sunken)] text-[var(--color-practice-ink-mute)]'
                  }`}>
                    {panel.status}
                  </span>
                </div>

                <h2 className="text-xl font-bold mb-2">{panel.name}</h2>
                <p className="text-sm leading-6 text-[var(--color-practice-ink-soft)] mb-5">
                  {panel.description}
                </p>

                <div className="flex flex-wrap gap-2 mb-6">
                  {panel.stages.map((stage) => (
                    <span
                      key={stage}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold
                                 bg-[var(--color-practice-sunken)] text-[var(--color-practice-ink-soft)]"
                    >
                      {stage}
                    </span>
                  ))}
                </div>

                <div className="pt-4 border-t border-[var(--color-practice-border)] flex items-center gap-4 text-sm">
                  <span className="font-semibold">{panel.duration}</span>
                  {panel.interviewers && (
                    <span className="text-[var(--color-practice-ink-mute)]">
                      {panel.interviewers} live interviewers
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </PracticeShell>
    </AuthGate>
  );
}
