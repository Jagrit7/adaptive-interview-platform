'use client';

/**
 * Manage your own question banks.
 *
 * Interviewers previously had two options: a built-in bank, or "custom" - which
 * meant the loose question list attached to one panel and re-typed for the
 * next. A bank made here is stored under the recruiter's own user id, reusable
 * across panels, and invisible to everyone else.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Plus, Trash2, Upload } from 'lucide-react';
import { AuthGate } from '@/components/ui/AuthGate';
import {
  BANK_DOMAINS, addBankItems, createBank, deleteBank, deleteBankItem,
  listBankItems, listUserBanks, parsePastedQuestions, parseQuestionFile,
  type BankDomain, type QuestionKind, type UserBank, type UserBankItem,
} from '@/lib/questionBanks';
import { ConsoleCard, ConsoleShell, StatusPill } from './ConsoleShell';

const KINDS: { value: QuestionKind; label: string; hint: string }[] = [
  { value: 'verbal', label: 'Verbal', hint: 'Asked out loud; the candidate answers by speaking.' },
  { value: 'written', label: 'Written', hint: 'Shown on screen; the candidate types an answer.' },
  { value: 'coding', label: 'Coding', hint: 'Shown on screen with the code editor.' },
];

export function EnterpriseQuestionBanksClient() {
  return <AuthGate role="enterprise"><BanksInner /></AuthGate>;
}

function BanksInner() {
  const [banks, setBanks] = useState<UserBank[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [items, setItems] = useState<UserBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async (keep?: string) => {
    const rows = await listUserBanks();
    setBanks(rows);
    const next = keep ?? (rows.some(b => b.id === selected) ? selected : rows[0]?.id ?? '');
    setSelected(next);
    setItems(next ? await listBankItems(next) : []);
  };

  // Matches how the other console screens load: an async IIFE with an `active`
  // guard, so a fast unmount does not set state on a gone component.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await listUserBanks();
        if (!active) return;
        setBanks(rows);
        const first = rows[0]?.id ?? '';
        setSelected(first);
        if (first) {
          const bankItems = await listBankItems(first);
          if (active) setItems(bankItems);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const current = banks.find(bank => bank.id === selected) ?? null;

  const run = async (work: () => Promise<string>) => {
    setError(''); setNotice('');
    try { setNotice(await work()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <ConsoleShell
      title="Question Banks"
      subtitle="Your own questions, stored the way the built-in banks are, and visible only to you."
    >
      {error && <ConsoleCard className="mb-5 border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</ConsoleCard>}
      {notice && <ConsoleCard className="mb-5 border-[#b8d9c2] bg-[#eff8f2] p-4 text-sm text-[#256134]">{notice}</ConsoleCard>}

      <div className="grid gap-5 lg:grid-cols-[300px_1fr] lg:items-start">
        <div className="space-y-4">
          <NewBankCard onCreated={async (bank) => { await refresh(bank.id); setNotice(`Created "${bank.name}".`); }} onError={setError} />
          <ConsoleCard className="overflow-hidden">
            <p className="border-b border-[#e5e7ea] px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#777c84]">
              Your banks
            </p>
            {loading && <p className="p-5 text-sm text-[#737880]">Loading…</p>}
            {!loading && !banks.length && <p className="p-5 text-sm text-[#676c74]">No banks yet. Create one above.</p>}
            {banks.map(bank => (
              <button
                key={bank.id}
                onClick={() => run(async () => {
                  setSelected(bank.id);
                  setItems(await listBankItems(bank.id));
                  return '';
                })}
                className={`flex w-full items-center gap-3 border-b border-[#eceef0] px-5 py-4 text-left last:border-0 ${bank.id === selected ? 'bg-[#f4f6f8]' : ''}`}
              >
                <BookOpen size={16} className="shrink-0 text-[#777c84]" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{bank.name}</b>
                  <span className="text-xs text-[#858a92]">{bank.item_count ?? 0} question{bank.item_count === 1 ? '' : 's'}</span>
                </span>
                <StatusPill tone="blue">{BANK_DOMAINS.find(d => d.value === bank.domain)?.label ?? bank.domain}</StatusPill>
              </button>
            ))}
          </ConsoleCard>
        </div>

        {current ? (
          <div className="space-y-5">
            <ConsoleCard className="flex flex-wrap items-center justify-between gap-3 p-6">
              <div>
                <h2 className="font-serif text-2xl font-bold">{current.name}</h2>
                <p className="mt-1 text-sm text-[#676c74]">
                  {items.length} question{items.length === 1 ? '' : 's'} ·{' '}
                  {items.filter(i => i.kind === 'verbal').length} verbal ·{' '}
                  {items.filter(i => i.kind !== 'verbal').length} written or coding
                </p>
              </div>
              <button
                onClick={() => run(async () => {
                  if (!confirm(`Delete "${current.name}" and its ${items.length} question(s)? Panels already published keep the copy they saved.`)) return '';
                  await deleteBank(current.id);
                  await refresh('');
                  return `Deleted "${current.name}".`;
                })}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                <Trash2 size={15} /> Delete bank
              </button>
            </ConsoleCard>

            <AddQuestionsCard
              bank={current}
              onAdded={async (count) => { await refresh(current.id); setNotice(`Added ${count} question${count === 1 ? '' : 's'}.`); }}
              onError={setError}
            />

            <ConsoleCard className="overflow-hidden">
              {!items.length && <p className="p-6 text-sm text-[#676c74]">No questions in this bank yet.</p>}
              {items.map((item, index) => (
                <div key={item.id} className="flex gap-4 border-b border-[#eceef0] p-5 last:border-0">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#f0f2f4] text-xs font-bold">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{item.question}</p>
                    {item.ideal_answer && <p className="mt-1.5 text-xs leading-5 text-[#6d727a]">Strong answer: {item.ideal_answer}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusPill tone={item.kind === 'verbal' ? 'blue' : 'amber'}>{item.kind}</StatusPill>
                      {item.tags.slice(0, 4).map(tag => (
                        <span key={tag} className="rounded bg-[#f0f2f4] px-2 py-1 text-[11px] font-semibold text-[#5f646c]">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    aria-label={`Delete question ${index + 1}`}
                    onClick={() => run(async () => { await deleteBankItem(item.id); await refresh(current.id); return 'Question removed.'; })}
                    className="shrink-0 text-[#8a8f96] hover:text-red-700"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </ConsoleCard>
          </div>
        ) : (
          <ConsoleCard className="grid min-h-[320px] place-items-center p-10 text-center">
            <div>
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#f0f2f4]"><BookOpen size={28} strokeWidth={1.4} /></span>
              <h2 className="mt-5 font-serif text-xl font-bold">No bank selected</h2>
              <p className="mt-2 max-w-sm text-sm text-[#676c74]">Create a bank, then upload a file or paste your questions into it.</p>
            </div>
          </ConsoleCard>
        )}
      </div>
    </ConsoleShell>
  );
}

function NewBankCard({ onCreated, onError }: { onCreated: (bank: UserBank) => void; onError: (message: string) => void }) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState<BankDomain>('behavioural');
  const [busy, setBusy] = useState(false);

  return (
    <ConsoleCard className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#777c84]">New bank</p>
      <input
        value={name}
        onChange={event => setName(event.target.value)}
        placeholder="e.g. Senior backend — behavioural"
        className="mt-3 h-10 w-full rounded-lg border border-[#dfe2e6] px-3 text-sm"
      />
      <label className="mt-3 block">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#777c84]">Domain</span>
        <select
          value={domain}
          onChange={event => setDomain(event.target.value as BankDomain)}
          className="mt-1.5 h-10 w-full rounded-lg border border-[#dfe2e6] px-2 text-sm"
        >
          {BANK_DOMAINS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {/* The domain is not a label. An interviewer only receives questions from
          the domains its role allows, so a behavioural bank handed to a DSA
          interviewer would be filtered away to nothing at session start. */}
      <p className="mt-2 text-[11px] leading-4 text-[#858a92]">
        Match this to the interviewer who will use it — questions outside an interviewer&apos;s
        domain are filtered out when the interview starts.
      </p>
      <button
        disabled={!name.trim() || busy}
        onClick={async () => {
          setBusy(true);
          try { onCreated(await createBank(name, domain)); setName(''); }
          catch (reason) { onError(reason instanceof Error ? reason.message : String(reason)); }
          finally { setBusy(false); }
        }}
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-black text-sm font-semibold text-white disabled:bg-[#c8ccd1]"
      >
        <Plus size={15} /> {busy ? 'Creating…' : 'Create bank'}
      </button>
    </ConsoleCard>
  );
}

function AddQuestionsCard({ bank, onAdded, onError }: { bank: UserBank; onAdded: (count: number) => void; onError: (message: string) => void }) {
  const [pasted, setPasted] = useState('');
  const [kind, setKind] = useState<QuestionKind>('verbal');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsedCount = useMemo(() => parsePastedQuestions(pasted).length, [pasted]);

  const submit = async (work: () => Promise<number>) => {
    setBusy(true);
    try { onAdded(await work()); }
    catch (reason) { onError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  return (
    <ConsoleCard className="p-6">
      <h3 className="font-serif text-xl font-bold">Add questions</h3>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#777c84]">Question type</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {KINDS.map(option => (
            <button
              key={option.value}
              onClick={() => setKind(option.value)}
              title={option.hint}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${kind === option.value ? 'border-black bg-black text-white' : 'border-[#dfe2e6]'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[#858a92]">{KINDS.find(k => k.value === kind)?.hint}</p>
      </label>

      <textarea
        value={pasted}
        onChange={event => setPasted(event.target.value)}
        rows={4}
        placeholder={'One question per line.\nTell me about a time you disagreed with a teammate.\nDescribe a project that did not go to plan.'}
        className="mt-4 w-full rounded-lg border border-[#dfe2e6] p-3 text-sm"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          disabled={!parsedCount || busy}
          onClick={() => submit(async () => {
            const questions = parsePastedQuestions(pasted);
            const added = await addBankItems(bank.id, bank.domain, questions.map(question => ({ question, kind })));
            setPasted('');
            return added;
          })}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-semibold text-white disabled:bg-[#c8ccd1]"
        >
          <Plus size={15} /> Add {parsedCount || ''} pasted
        </button>

        <button
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dfe2e6] px-4 text-sm font-semibold hover:bg-[#f5f6f7] disabled:opacity-50"
        >
          <Upload size={15} /> Upload a file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.json,.jsonl,.md,.txt"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void submit(async () => {
              const parsed = await parseQuestionFile(file);
              // The file wins where it states a kind; the toggle above is only
              // the default for rows that do not.
              return addBankItems(bank.id, bank.domain, parsed.map(item => ({
                question: item.question, ideal_answer: item.idealAnswer,
                tags: item.tags, difficulty: item.difficulty, kind: item.kind ?? kind,
              })));
            });
          }}
        />
        <span className="text-xs text-[#858a92]">CSV, TSV, JSON, JSONL, Markdown or text — with an optional answer column.</span>
      </div>
    </ConsoleCard>
  );
}
