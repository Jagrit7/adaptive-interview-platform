'use client';

import Link from 'next/link';

/** Enterprise marketing page. Serif headings and near-black actions, matching
 *  the console it leads into — a different temperature from the consumer side,
 *  same brand. */

const POINTS = [
  'Standardised assessments across every candidate',
  'Your own questions, ideal answers and pass marks',
  'A written report for every interview, not a gut feeling',
];

export default function EnterpriseLanding() {
  return (
    <div className="min-h-screen bg-[var(--color-console-bg)] text-[var(--color-console-ink)]">
      <header className="border-b border-[var(--color-console-border)]
                         bg-[var(--color-console-surface)]">
        <div className="mx-auto max-w-[1200px] px-6 h-16 flex items-center">
          <Link href="/" className="font-serif text-2xl font-bold tracking-tight">
            InterviewPro
          </Link>
          <span className="ml-3 text-[10px] tracking-[0.18em]
                           text-[var(--color-console-ink-mute)]">ENTERPRISE</span>
          <Link href="/login" className="ml-auto text-sm font-semibold">Sign in</Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1200px] px-6 py-24 grid gap-16 lg:grid-cols-2 items-center">
        <div>
          <h1 className="font-serif text-[52px] font-bold tracking-tight leading-[1.08] mb-6">
            Interview better.<br />Hire with confidence.
          </h1>
          <p className="text-lg text-[var(--color-console-ink-soft)] max-w-[48ch] mb-9">
            Build the panel once, run it with every candidate, and compare them against
            the same bar rather than against whoever interviewed them.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/enterprise"
                  className="px-7 py-3.5 rounded-lg font-semibold text-white
                             bg-[var(--color-console-accent)] hover:brightness-150 transition">
              Open the console
            </Link>
            <Link href="/builder"
                  className="px-7 py-3.5 rounded-lg font-semibold
                             bg-[var(--color-console-surface)]
                             border border-[var(--color-console-border)]
                             hover:bg-[var(--color-console-bg)] transition">
              Build an interview
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-console-border)]
                        bg-[var(--color-console-surface)] p-6
                        shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="rounded-xl bg-[#0f131d] p-5 font-mono text-xs
                          text-[#8b93a7] leading-relaxed">
            <div className="text-[#00e5ff] mb-3">● LIVE — Technical round</div>
            <p className="mb-2 text-[#dfe2f1]">
              &ldquo;Walk me through how you would design a URL shortener.&rdquo;
            </p>
            <p className="mb-3">Candidate answering · 02:14</p>
            <div className="h-px bg-[#313540] mb-3" />
            <div className="flex justify-between"><span>System design</span><span className="text-[#dfe2f1]">0.82</span></div>
            <div className="flex justify-between"><span>Communication</span><span className="text-[#dfe2f1]">0.74</span></div>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--color-console-border)]
                          bg-[var(--color-console-surface)]">
        <div className="mx-auto max-w-[1200px] px-6 py-16">
          <h2 className="font-serif text-3xl font-bold mb-4">For enterprises</h2>
          <p className="text-[var(--color-console-ink-soft)] max-w-[62ch] mb-8">
            One assessment standard, applied consistently, with the evidence written down.
          </p>
          <ul className="space-y-3 mb-10">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3 text-[15px]
                                     text-[var(--color-console-ink-soft)]">
                <span className="text-[#15803d]">✓</span>{p}
              </li>
            ))}
          </ul>
          <Link href="/enterprise" className="font-semibold hover:underline">
            Explore enterprise solutions →
          </Link>
        </div>
      </section>

      <footer className="py-10">
        <div className="mx-auto max-w-[1200px] px-6 flex flex-wrap gap-6 items-center
                        justify-between text-sm text-[var(--color-console-ink-mute)]">
          <span className="font-serif text-lg font-bold
                           text-[var(--color-console-ink)]">InterviewPro</span>
          <nav className="flex flex-wrap gap-6">
            <Link href="/enterprise">Console</Link>
            <Link href="/panels">Interviews</Link>
            <Link href="/individuals">For individuals</Link>
          </nav>
          <span>© 2026 InterviewPro</span>
        </div>
      </footer>
    </div>
  );
}
