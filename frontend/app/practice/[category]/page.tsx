'use client';

import { use } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PracticeShell } from '@/components/practice/PracticeShell';
import { CATEGORIES, USER } from '@/lib/mockData';

/**
 * One template, five categories. Technical, behavioural, case study, system
 * design and HR round are the same screen with different content — building
 * five near-identical files would be five places to fix every future change.
 */
export default function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = use(params);
  const c = CATEGORIES[category];
  if (!c) notFound();

  return (
    <PracticeShell user={USER} active="Dashboard">
      <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
        <div className="max-w-[62ch]">
          <div className="text-[11px] font-bold tracking-[0.14em]
                          text-[var(--color-practice-accent)] mb-3">
            {c.eyebrow}
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-4">{c.name}</h1>
          <p className="text-[var(--color-practice-ink-soft)] leading-relaxed">{c.blurb}</p>
        </div>
        <Link href="/practice/configure"
              className="shrink-0 px-7 py-3.5 rounded-full font-semibold text-white
                         bg-[var(--color-practice-accent)] hover:brightness-110 transition">
          Start {c.name.split(' ')[0].toLowerCase()} interview
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr] mb-10">
        <article className="rounded-[var(--radius-panel)] p-7
                            bg-[var(--color-practice-surface)]
                            border border-[var(--color-practice-border)]">
          <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold mb-5
                           bg-[color-mix(in_srgb,var(--color-practice-xp)_16%,white)]
                           text-[#b45309]">
            {c.featured.tag}
          </span>
          <h2 className="text-2xl font-extrabold mb-3">{c.featured.title}</h2>
          <p className="text-[var(--color-practice-ink-soft)] mb-7 max-w-[52ch]">
            {c.featured.blurb}
          </p>
          <div className="flex items-center gap-4">
            <Link href="/practice/configure"
                  className="px-6 py-2.5 rounded-full font-semibold text-sm
                             bg-[var(--color-practice-sunken)]
                             text-[var(--color-practice-accent)]">
              Resume
            </Link>
            <span className="text-xs text-[var(--color-practice-ink-mute)]">
              +{c.featured.peers} others practising this
            </span>
          </div>
        </article>

        <article className="rounded-[var(--radius-panel)] p-7 text-white
                            bg-[var(--color-practice-accent)]">
          <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold mb-5
                           bg-white/20">
            {c.daily.tag}
          </span>
          <h2 className="text-2xl font-extrabold leading-snug mb-3">{c.daily.title}</h2>
          <p className="text-sm text-white/75 mb-7">{c.daily.blurb}</p>
          <button className="px-6 py-2.5 rounded-full font-semibold text-sm
                             bg-white text-[var(--color-practice-accent)]">
            {c.daily.cta}
          </button>
        </article>
      </div>

      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-extrabold">Explore by area</h2>
        <Link href="/skills"
              className="text-sm font-semibold text-[var(--color-practice-accent)]">
          View all paths
        </Link>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {c.explore.map((e) => (
          <Link key={e.label} href="/practice"
                className="rounded-[var(--radius-card)] p-5 text-center
                           bg-[var(--color-practice-surface)]
                           border border-[var(--color-practice-border)]
                           hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(15,23,42,0.08)]
                           transition">
            <span className="w-12 h-12 mx-auto mb-3 rounded-[var(--radius-control)]
                             grid place-items-center text-sm font-bold
                             bg-[var(--color-practice-sunken)]
                             text-[var(--color-practice-accent)]">
              {e.label.slice(0, 2).toUpperCase()}
            </span>
            <div className="font-bold text-sm">{e.label}</div>
            <div className="text-xs text-[var(--color-practice-ink-mute)] mt-1">
              {e.count} challenges
            </div>
          </Link>
        ))}
      </div>
    </PracticeShell>
  );
}
