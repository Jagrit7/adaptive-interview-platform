'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useBuilderStore } from '@/store/builderStore';

/**
 * The unified landing page, from the photo.
 *
 * The two paths are the whole point of this screen, so they carry the visual
 * weight: indigo fill for individuals, near-black for enterprises. Different
 * temperature, not two mirrored cards — the audiences want opposite things.
 */

const STEPS = [
  { n: '1', title: 'Set up',    body: 'Configure your profile, or define the role you are hiring for.' },
  { n: '2', title: 'Interview', body: 'Speak to a panel that adapts to what you say and hands off between specialists.' },
  { n: '3', title: 'Evaluate',  body: 'Get a competency breakdown scored against a rubric, not a vibe.' },
];

const STATS = [
  { value: '2.5M+', label: 'Interviews conducted' },
  { value: '99.8%', label: 'Uptime' },
  { value: '18',    label: 'Languages supported' },
];

export default function HomePage() {
  const router = useRouter();
  const newPanel = useBuilderStore((s) => s.newPanel);

  return (
    <div className="min-h-screen bg-[var(--color-practice-bg)] text-[var(--color-practice-ink)]">
      <header className="border-b border-[var(--color-practice-border)]
                         bg-[var(--color-practice-surface)]">
        <div className="mx-auto max-w-[1280px] px-6 h-16 flex items-center gap-10">
          <span className="text-xl font-extrabold tracking-tight
                           text-[var(--color-practice-deep)]">InterviewPro</span>
          <nav className="hidden md:flex items-center gap-7 text-sm
                          text-[var(--color-practice-ink-soft)]">
            <Link href="/individuals" className="hover:text-[var(--color-practice-ink)]">For individuals</Link>
            <Link href="/enterprise-landing" className="hover:text-[var(--color-practice-ink)]">For enterprises</Link>
            <Link href="/leaderboard" className="hover:text-[var(--color-practice-ink)]">Leaderboard</Link>
          </nav>
          <Link href="/login"
                className="ml-auto text-sm font-semibold text-[var(--color-practice-accent)]">
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1280px] px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl md:text-[56px] font-extrabold tracking-tight
                       leading-[1.08] max-w-[18ch] mx-auto mb-6">
          Master your next interview. Build your perfect hiring process.
        </h1>
        <p className="text-lg text-[var(--color-practice-ink-soft)] max-w-[62ch] mx-auto">
          One AI interview engine, two very different jobs — helping you get ready, and
          helping you decide.
        </p>
      </section>

      <section className="mx-auto max-w-[1280px] px-6 pb-20 grid gap-6 md:grid-cols-2">
        <PathCard
          eyebrow="For individuals"
          title="Practise with AI mock interviews"
          body="Interviews by skill, role and language. Real feedback, a streak worth keeping, and a leaderboard to chase."
          cta="Start practising"
          onClick={() => router.push('/practice')}
          variant="individual"
        />
        <PathCard
          eyebrow="For enterprises"
          title="Design and run your own interviews"
          body="Build the panel. Upload your questions and ideal answers. Set the pass marks. Review every candidate against the same bar."
          cta="Build an interview"
          onClick={() => { newPanel(); router.push('/enterprise'); }}
          variant="enterprise"
        />
      </section>

      <section className="border-y border-[var(--color-practice-border)]
                          bg-[var(--color-practice-surface)]">
        <div className="mx-auto max-w-[1280px] px-6 py-16">
          <h2 className="text-2xl font-extrabold text-center mb-3">How it works</h2>
          <p className="text-center text-[var(--color-practice-ink-soft)] mb-12 max-w-[52ch] mx-auto">
            The same engine either way. What changes is who sets the questions.
          </p>
          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n}
                  className="rounded-[var(--radius-card)] p-6
                             bg-[var(--color-practice-bg)]
                             border border-[var(--color-practice-border)]">
                <span className="w-9 h-9 rounded-full grid place-items-center mb-4 font-bold
                                 text-white bg-[var(--color-practice-accent)]">
                  {s.n}
                </span>
                <h3 className="font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-[var(--color-practice-ink-soft)]">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-6 py-16 grid gap-8 sm:grid-cols-3 text-center">
        {STATS.map((s) => (
          <div key={s.label}>
            <div className="text-4xl font-extrabold text-[var(--color-practice-deep)] mb-1">
              {s.value}
            </div>
            <div className="text-xs tracking-wide text-[var(--color-practice-ink-mute)]">
              {s.label}
            </div>
          </div>
        ))}
      </section>

      <footer className="border-t border-[var(--color-practice-border)]
                         bg-[var(--color-practice-surface)]">
        <div className="mx-auto max-w-[1280px] px-6 py-10 flex flex-wrap gap-6
                        items-center justify-between text-sm
                        text-[var(--color-practice-ink-mute)]">
          <span className="font-extrabold text-[var(--color-practice-deep)]">InterviewPro</span>
          <nav className="flex flex-wrap gap-6">
            <Link href="/practice">Individuals</Link>
            <Link href="/enterprise">Enterprises</Link>
            <Link href="/leaderboard">Leaderboard</Link>
          </nav>
          <span>© 2026 InterviewPro</span>
        </div>
      </footer>
    </div>
  );
}

function PathCard({ eyebrow, title, body, cta, onClick, variant }: {
  eyebrow: string; title: string; body: string; cta: string;
  onClick: () => void; variant: 'individual' | 'enterprise';
}) {
  const individual = variant === 'individual';
  return (
    <button
      onClick={onClick}
      className={`group text-left rounded-[var(--radius-panel)] p-9 min-h-[280px]
                  flex flex-col transition hover:-translate-y-1
                  hover:shadow-[0_18px_40px_rgba(15,23,42,0.16)] ${
        individual
          ? 'bg-[var(--color-practice-accent)] text-white'
          : 'bg-[var(--color-console-accent)] text-white'
      }`}
    >
      <span className="self-start px-3 py-1 rounded-full text-[11px] font-bold mb-6
                       bg-white/15">
        {eyebrow}
      </span>
      <h2 className="text-2xl font-extrabold leading-snug mb-3 max-w-[22ch]">{title}</h2>
      <p className="text-sm text-white/75 mb-8 max-w-[44ch]">{body}</p>
      <span className={`mt-auto self-start px-5 py-2.5 rounded-[var(--radius-control)]
                        font-semibold text-sm transition ${
        individual
          ? 'bg-white text-[var(--color-practice-accent)]'
          : 'bg-[var(--color-practice-accent)] text-white'
      }`}>
        {cta}
      </span>
    </button>
  );
}
