'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Braces, BriefcaseBusiness, Check, Layers3, Loader2 } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const FALLBACK_TOPICS = [
  { slug: 'arrays', name: 'Arrays', parent: null, question_count: 5 },
  { slug: 'stacks-queues', name: 'Stacks & Queues', parent: null, question_count: 2 },
  { slug: 'search-sort', name: 'Search & Sort', parent: null, question_count: 2 },
  { slug: 'trees', name: 'Trees', parent: null, question_count: 1 },
  { slug: 'graphs', name: 'Graphs', parent: null, question_count: 1 },
];

type Topic = { slug: string; name: string; parent: string | null; question_count: number };
type Mode = 'topic' | 'sde';

export default function DsaInterviewSetupPage() {
  const [mode, setMode] = useState<Mode>('topic');
  const [topics, setTopics] = useState<Topic[]>(FALLBACK_TOPICS);
  const [topic, setTopic] = useState('arrays');
  const [difficulty, setDifficulty] = useState('1-2');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND_URL}/dsa/sessions/catalog`)
      .then(async (response) => response.ok ? response.json() : Promise.reject())
      .then((catalog) => {
        const roots = (catalog.topics as Topic[]).filter((item) => item.parent === null);
        setTopics([...new Map(roots.map((item) => [item.slug, item])).values()]);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const href = useMemo(() => {
    const [difficultyMin, difficultyMax] = difficulty.split('-');
    const params = new URLSearchParams({ difficulty_min: difficultyMin, difficulty_max: difficultyMax });
    if (mode === 'topic') {
      params.set('mode', 'topic_subtree');
      params.set('topic', topic);
    } else {
      params.set('mode', 'blueprint');
      params.set('blueprint', 'sde-core');
    }
    return `/skills/dsa/interview?${params.toString()}`;
  }, [difficulty, mode, topic]);

  return (
    <main className="min-h-screen bg-[#070a10] px-5 py-8 text-[#eef4fb] md:px-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/skills/dsa" className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-300">
          <ArrowLeft size={16} /> Back to DSA path
        </Link>

        <div className="mt-10 max-w-3xl">
          <p className="font-mono text-xs font-bold tracking-[0.2em] text-cyan-300">INTERVIEW CONFIGURATION</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Choose what Ari should test.</h1>
          <p className="mt-4 text-base leading-7 text-slate-400">
            Practise one topic and its children, or draw from the weighted SDE blueprint across the full DSA bank.
          </p>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <ModeCard active={mode === 'topic'} icon={<Layers3 />} title="Topic practice"
            description="Select from one branch such as Arrays, including its child topics like hashing and sliding window."
            onClick={() => setMode('topic')} />
          <ModeCard active={mode === 'sde'} icon={<BriefcaseBusiness />} title="SDE assessment"
            description="Use the weighted SDE blueprint across arrays, stacks, queues, search, trees, and graphs."
            onClick={() => setMode('sde')} />
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Question scope</label>
              {mode === 'topic' ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {topics.map((item) => (
                    <button key={`topic-${item.slug}`} onClick={() => setTopic(item.slug)}
                      className={`rounded-xl border px-4 py-3 text-left transition ${topic === item.slug ? 'border-cyan-400 bg-cyan-400/10 text-white' : 'border-white/10 bg-black/20 text-slate-400 hover:border-white/20'}`}>
                      <span className="block text-sm font-bold">{item.name}</span>
                      <span className="mt-1 block text-xs">{item.question_count} seeded question{item.question_count === 1 ? '' : 's'}</span>
                    </button>
                  ))}
                  {loading && <span className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> Loading catalog</span>}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-violet-400/25 bg-violet-400/[0.07] p-4">
                  <div className="flex items-center gap-2 font-bold"><Braces size={18} className="text-violet-300" /> SDE Core v1</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Weighted toward arrays, with balanced coverage from the remaining foundational branches.</p>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Difficulty range</label>
              <div className="mt-3 space-y-2">
                {[['1-2', 'Foundation', 'Levels 1–2'], ['2-3', 'Interview ready', 'Levels 2–3'], ['1-3', 'Adaptive mix', 'Levels 1–3']].map(([value, title, detail]) => (
                  <button key={value} onClick={() => setDifficulty(value)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${difficulty === value ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 bg-black/20 hover:border-white/20'}`}>
                    <span><span className="block text-sm font-bold">{title}</span><span className="text-xs text-slate-500">{detail}</span></span>
                    {difficulty === value && <Check size={17} className="text-cyan-300" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
            <p className="max-w-xl text-xs leading-5 text-slate-500">A question version is selected once and remains fixed for the session. Run Code uses public cases; Submit also checks protected hidden cases.</p>
            <Link href={href} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200">
              Start interview <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function ModeCard({ active, icon, title, description, onClick }: { active: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-2xl border p-6 text-left transition ${active ? 'border-cyan-400 bg-cyan-400/[0.08] shadow-[0_0_40px_rgba(34,211,238,0.08)]' : 'border-white/10 bg-white/[0.025] hover:border-white/20'}`}>
      <span className={`inline-flex rounded-xl p-3 ${active ? 'bg-cyan-300 text-slate-950' : 'bg-white/5 text-slate-400'}`}>{icon}</span>
      <span className="mt-5 block text-lg font-black">{title}</span>
      <span className="mt-2 block text-sm leading-6 text-slate-400">{description}</span>
    </button>
  );
}
