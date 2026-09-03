import Link from 'next/link';
import { ArrowLeft, Check, Clock3, LockKeyhole, MessageCircleMore, Sparkles } from 'lucide-react';
import type { SkillModule } from '@/lib/skillPaths/dsa';

interface SkillPathDetailProps {
  eyebrow: string;
  title: string;
  description: string;
  level: string;
  modules: readonly SkillModule[];
  interviewer: {
    name: string;
    format: string;
    competencies: string[];
    launchHref?: string;
  };
}

/** Shared visual contract for every individual skill-path detail page. */
export function SkillPathDetail({
  eyebrow, title, description, level, modules, interviewer,
}: SkillPathDetailProps) {
  const available = modules.filter((module) => module.state === 'available');
  const minutes = available.reduce((sum, module) => sum + module.estimatedMinutes, 0);

  return (
    <div className="pb-12">
      <Link href="/skills"
        className="inline-flex items-center gap-2 text-sm font-semibold mb-6
                   text-[var(--color-practice-ink-soft)] hover:text-[var(--color-practice-accent)]">
        <ArrowLeft size={16} /> All skill paths
      </Link>

      <section className="relative overflow-hidden rounded-[32px] p-7 md:p-10 mb-7
                          bg-[var(--color-practice-deep)] text-white shadow-[0_18px_50px_rgba(35,38,120,0.2)]">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute right-24 bottom-[-110px] h-56 w-56 rounded-full
                        bg-[var(--color-practice-pass)]/20" />
        <div className="relative max-w-[720px]">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5
                           text-xs font-bold tracking-[0.14em] mb-5">
            <Sparkles size={14} /> {eyebrow}
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">{title}</h1>
          <p className="text-base md:text-lg text-white/75 leading-relaxed max-w-[65ch]">{description}</p>
          <div className="flex flex-wrap gap-3 mt-7 text-sm font-semibold">
            <span className="rounded-full bg-white/12 px-4 py-2">{level}</span>
            <span className="rounded-full bg-white/12 px-4 py-2">{available.length} modules available</span>
            <span className="rounded-full bg-white/12 px-4 py-2">About {minutes} minutes</span>
          </div>
        </div>
      </section>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section id="curriculum" className="rounded-[var(--radius-panel)] p-6 md:p-8
                    bg-[var(--color-practice-surface)] border border-[var(--color-practice-border)]">
          <div className="mb-7">
            <p className="text-xs font-bold tracking-[0.14em] text-[var(--color-practice-accent)] mb-2">
              LEARNING ROADMAP
            </p>
            <h2 className="text-2xl font-extrabold">Your DSA foundation path</h2>
          </div>

          <div className="space-y-4">
            {modules.map((module, index) => {
              const locked = module.state === 'coming_soon';
              return (
                <article key={module.id}
                  className={`relative rounded-[var(--radius-card)] border p-5 md:p-6 ${
                    locked
                      ? 'bg-[var(--color-practice-sunken)] border-transparent opacity-75'
                      : 'bg-white border-[var(--color-practice-border)] shadow-[0_5px_16px_rgba(15,23,42,0.05)]'
                  }`}>
                  {index < modules.length - 1 && (
                    <span className="absolute left-[41px] top-[68px] h-[calc(100%-45px)] w-1 rounded-full
                                     bg-[var(--color-practice-border)]" aria-hidden="true" />
                  )}
                  <div className="flex gap-4">
                    <span className={`relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full font-extrabold ${
                      locked
                        ? 'bg-white text-[var(--color-practice-ink-mute)]'
                        : 'bg-[var(--color-practice-accent)] text-white'
                    }`}>
                      {locked ? <LockKeyhole size={17} /> : module.order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-extrabold text-lg">{module.title}</h3>
                          <p className="text-sm text-[var(--color-practice-ink-soft)] leading-relaxed mt-1 max-w-[65ch]">
                            {module.description}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold
                                         bg-[var(--color-practice-sunken)] text-[var(--color-practice-ink-soft)]">
                          {locked ? 'Coming soon' : <><Clock3 size={13} /> {module.estimatedMinutes} min</>}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-4">
                        {module.topics.map((topic) => (
                          <span key={topic} className="rounded-full border border-[var(--color-practice-border)]
                                                       px-2.5 py-1 text-xs font-medium text-[var(--color-practice-ink-soft)]">
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[var(--radius-panel)] p-6 bg-[var(--color-practice-surface)]
                              border border-[var(--color-practice-border)]">
            <div className="h-12 w-12 grid place-items-center rounded-[var(--radius-control)] mb-5
                            bg-[color-mix(in_srgb,var(--color-practice-accent)_14%,white)]
                            text-[var(--color-practice-accent)]">
              <MessageCircleMore size={23} />
            </div>
            <p className="text-xs font-bold tracking-[0.14em] text-[var(--color-practice-accent)] mb-2">
              PRECONFIGURED INTERVIEWER
            </p>
            <h2 className="text-xl font-extrabold mb-2">Meet {interviewer.name}</h2>
            <p className="text-sm leading-relaxed text-[var(--color-practice-ink-soft)]">
              A supportive DSA interviewer for {interviewer.format}.
            </p>
            <ul className="space-y-2.5 mt-5">
              {interviewer.competencies.map((competency) => (
                <li key={competency} className="flex gap-2 text-sm font-semibold">
                  <Check size={17} className="mt-0.5 text-[var(--color-practice-pass)]" />
                  {competency}
                </li>
              ))}
            </ul>
            {interviewer.launchHref ? (
              <Link href={interviewer.launchHref}
                className="mt-6 block w-full rounded-full px-5 py-3 text-center font-bold text-sm text-white
                           bg-[var(--color-practice-accent)] hover:brightness-110 transition">
                Enter DSA interview
              </Link>
            ) : (
              <button type="button" disabled
                className="mt-6 w-full rounded-full px-5 py-3 font-bold text-sm cursor-not-allowed
                           bg-[var(--color-practice-sunken)] text-[var(--color-practice-ink-mute)]">
                Interview integration is next
              </button>
            )}
          </section>

          <section className="rounded-[var(--radius-card)] p-5
                              bg-[color-mix(in_srgb,var(--color-practice-pass)_12%,white)]
                              border border-[color-mix(in_srgb,var(--color-practice-pass)_25%,white)]">
            <p className="font-bold text-sm mb-1">One path, fully focused</p>
            <p className="text-sm text-[var(--color-practice-ink-soft)] leading-relaxed">
              DSA is the only live skill path during this release. Other paths stay visible as roadmap stubs.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
