'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Archive, ArrowRight, FileText, PlayCircle, Plus, RotateCcw, Search, Trash2, UserPlus } from 'lucide-react';
import { AuthGate } from '@/components/ui/AuthGate';
import { deletePanel, listPanels, loadPanel, setPanelArchived, type PanelConfig, type PanelLifecycleStatus, type PanelSummary } from '@/lib/panels';
import { useEnterpriseInterviewStore } from '@/store/enterpriseInterviewStore';
import { ConsoleButton, ConsoleCard, ConsoleShell, StatusPill } from './ConsoleShell';
import { openInterviewTest } from './EnterpriseInterviewTest';

export function EnterpriseTemplatesClient() {
  return <AuthGate role="enterprise"><TemplatesInner /></AuthGate>;
}

function TemplatesInner() {
  const router = useRouter();
  const apply = useEnterpriseInterviewStore((state) => state.applyTemplate);
  const templates = [
    ['blank', 'Blank Template', 'Start with an empty stage, panel, question bank, and rubric.'],
    ['frontend', 'Senior Frontend Engineer', 'React, architecture, coding, and communication.'],
    ['product', 'Product Manager — Tier 1', 'Product sense, execution, analytics, and stakeholder communication.'],
    ['system-design', 'System Design Expert', 'Scalability, reliability, data modeling, and trade-off analysis.'],
  ] as const;

  function choose(id: (typeof templates)[number][0]) {
    apply(id);
    router.push('/enterprise/builder/basics');
  }

  return (
    <ConsoleShell
      title="Interview Templates"
      subtitle="Choose a starting point, then customize every stage and interviewer."
      actions={<ConsoleButton href="/enterprise/interviews">View Interviews</ConsoleButton>}
    >
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {templates.map((template, index) => (
          <ConsoleCard key={template[0]} className={`flex min-h-[300px] flex-col p-6 ${index === 0 ? 'border-dashed' : ''}`}>
            <span className="grid size-11 place-items-center rounded-lg bg-[#eef1f4]">
              {index === 0 ? <Plus size={20} /> : <FileText size={20} />}
            </span>
            <h2 className="mt-7 font-serif text-xl font-bold">{template[1]}</h2>
            <p className="mt-3 flex-1 text-sm leading-6 text-[#666b73]">{template[2]}</p>
            <div className="mb-5 flex gap-2 text-xs text-[#666b73]">
              <span className="rounded bg-[#f1f3f5] px-2 py-1">Customizable</span>
              {index > 0 && <span className="rounded bg-[#f1f3f5] px-2 py-1">Preconfigured</span>}
            </div>
            <ConsoleButton variant={index === 0 ? 'outline' : 'solid'} onClick={() => choose(template[0])}>
              {index === 0 ? 'Create blank' : 'Use template'} <ArrowRight size={15} />
            </ConsoleButton>
          </ConsoleCard>
        ))}
      </div>
    </ConsoleShell>
  );
}

export function EnterpriseInterviewsClient() {
  return <AuthGate role="enterprise"><InterviewsInner /></AuthGate>;
}

function InterviewsInner() {
  const router = useRouter();
  const reset = useEnterpriseInterviewStore((state) => state.reset);
  const loadConfig = useEnterpriseInterviewStore((state) => state.loadConfig);
  const [rows, setRows] = useState<PanelSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | PanelLifecycleStatus>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    listPanels()
      .then((data) => {
        if (active) {
          setRows(data);
          setState('ready');
        }
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setState('error');
        }
      });
    return () => { active = false; };
  }, []);

  async function edit(id: string) {
    try {
      const row = await loadPanel(id);
      loadConfig(row.id, row.config);
      router.push('/enterprise/builder/basics');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setState('error');
    }
  }

  function create() {
    reset();
    router.push('/enterprise/templates');
  }

  async function remove(row: PanelSummary) {
    if (!window.confirm(`Delete "${row.project_name}"? This removes the interview panel from Supabase and cannot be undone. Existing candidate reports will be preserved.`)) return;
    setDeletingId(row.id);
    setError('');
    try {
      await deletePanel(row.id);
      setRows(current => current.filter(item => item.id !== row.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDeletingId(null);
    }
  }

  async function changeArchiveState(row: PanelSummary) {
    const archiving = row.status !== 'archived';
    setChangingId(row.id);
    setError('');
    try {
      const status = await setPanelArchived(row.id, archiving);
      setRows(current => current.map(item => item.id === row.id ? { ...item, status } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setChangingId(null);
    }
  }

  const normalizedSearch = search.trim().toLowerCase();
  const visibleRows = rows.filter(row => {
    if (activeTab !== 'all' && row.status !== activeTab) return false;
    if (!normalizedSearch) return true;
    return `${row.project_name} ${row.role} ${row.language}`.toLowerCase().includes(normalizedSearch);
  });
  const tabs: Array<{ label: string; value: 'all' | PanelLifecycleStatus }> = [
    { label: 'All Interviews', value: 'all' },
    { label: 'Draft', value: 'draft' },
    { label: 'Published', value: 'published' },
    { label: 'Archived', value: 'archived' },
  ];

  return (
    <ConsoleShell
      title="Interviews"
      subtitle="Create, publish, and manage your custom interview panels."
      actions={<ConsoleButton onClick={create}><Plus size={16} /> Create Interview</ConsoleButton>}
    >
      <div className="mb-5 flex gap-5 border-b border-[#dfe2e6]">
        {tabs.map(tab => (
          <button key={tab.value} aria-pressed={activeTab === tab.value} onClick={() => setActiveTab(tab.value)} className={`pb-3 text-sm font-semibold ${activeTab === tab.value ? 'border-b-2 border-black' : 'text-[#777c84]'}`}>
            {tab.label} <span className="ml-1 text-xs text-[#92969c]">{tab.value === 'all' ? rows.length : rows.filter(row => row.status === tab.value).length}</span>
          </button>
        ))}
      </div>

      {state === 'error' && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {state === 'loading' && <ConsoleCard className="p-8 text-sm text-[#737880]">Loading your interviews…</ConsoleCard>}
      {state === 'ready' && rows.length === 0 && (
        <ConsoleCard className="grid min-h-[360px] place-items-center p-10 text-center">
          <div>
            <h2 className="font-serif text-2xl font-bold">No custom interviews yet</h2>
            <p className="mt-2 text-sm text-[#6d727a]">Start with a RecruitPro template or build a panel from scratch.</p>
            <div className="mt-6"><ConsoleButton onClick={create}>Build your first interview</ConsoleButton></div>
          </div>
        </ConsoleCard>
      )}
      {state === 'ready' && rows.length > 0 && (
        <ConsoleCard className="overflow-hidden">
          <div className="flex gap-3 p-5">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-3" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search interviews" className="h-10 w-full rounded-lg border border-[#dfe2e6] pl-9 text-sm" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="border-y border-[#e5e7ea] bg-[#fafbfc] text-left text-xs uppercase tracking-wider text-[#777c84]">
                <tr>
                  <th className="px-6 py-3">Interview</th><th className="px-6 py-3">Role</th><th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Panel</th><th className="px-6 py-3">Updated</th><th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} className="border-b border-[#e8eaed]">
                    <td className="px-6 py-4"><Link href={`/enterprise/interviews/${row.id}`} className="font-semibold hover:underline">{row.project_name}</Link></td>
                    <td className="px-6 py-4 text-[#636870]">{row.role}</td>
                    <td className="px-6 py-4"><StatusPill tone={row.status === 'published' ? 'green' : row.status === 'archived' ? 'gray' : 'amber'}>{row.status}</StatusPill></td>
                    <td className="px-6 py-4">{row.agentCount} interviewer{row.agentCount === 1 ? '' : 's'}</td>
                    <td className="px-6 py-4 text-[#636870]">{new Date(row.updated_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-4">
                        <button onClick={() => openInterviewTest(row.id)} className="inline-flex items-center gap-1.5 font-semibold hover:underline"><PlayCircle size={15} /> Test</button>
                        <button onClick={() => edit(row.id)} className="font-semibold hover:underline">Edit</button>
                        <button disabled={changingId === row.id} onClick={() => void changeArchiveState(row)} className="inline-flex items-center gap-1.5 font-semibold hover:underline disabled:cursor-wait disabled:opacity-50">{row.status === 'archived' ? <RotateCcw size={15} /> : <Archive size={15} />}{changingId === row.id ? 'Updating…' : row.status === 'archived' ? 'Restore' : 'Archive'}</button>
                        <button disabled={deletingId === row.id} onClick={() => void remove(row)} className="inline-flex items-center gap-1.5 font-semibold text-red-700 hover:underline disabled:cursor-wait disabled:opacity-50"><Trash2 size={15} /> {deletingId === row.id ? 'Deleting…' : 'Delete'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleRows.length === 0 && <p className="border-t border-[#e5e7ea] p-8 text-center text-sm text-[#6d727a]">No {activeTab === 'all' ? '' : `${activeTab} `}interviews match your search.</p>}
        </ConsoleCard>
      )}
    </ConsoleShell>
  );
}

export function EnterpriseInterviewDetailClient({ panelId }: { panelId: string }) {
  return <AuthGate role="enterprise"><InterviewDetailInner panelId={panelId} /></AuthGate>;
}

function InterviewDetailInner({ panelId }: { panelId: string }) {
  const router = useRouter();
  const loadConfig = useEnterpriseInterviewStore((state) => state.loadConfig);
  const [config, setConfig] = useState<PanelConfig | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    let active = true;
    loadPanel(panelId)
      .then((row) => { if (active) setConfig(row.config); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [panelId]);

  async function edit() {
    try {
      const row = await loadPanel(panelId);
      loadConfig(row.id, row.config);
      router.push('/enterprise/builder/basics');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function remove() {
    if (!config || !window.confirm(`Delete "${config.projectName}"? This removes the interview panel from Supabase and cannot be undone. Existing candidate reports will be preserved.`)) return;
    setDeleting(true);
    setError('');
    try {
      await deletePanel(panelId);
      router.replace('/enterprise/interviews');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setDeleting(false);
    }
  }

  async function changeArchiveState() {
    if (!config) return;
    const archiving = config.enterprise?.status !== 'archived';
    setChangingStatus(true);
    setError('');
    try {
      const status = await setPanelArchived(panelId, archiving);
      setConfig(current => current?.enterprise ? {
        ...current,
        enterprise: {
          ...current.enterprise,
          status,
          archivedFrom: status === 'archived'
            ? (current.enterprise.status === 'published' ? 'published' : 'draft')
            : undefined,
        },
      } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setChangingStatus(false);
    }
  }

  if (error) return <ConsoleShell title="Interview unavailable" subtitle={error}><ConsoleButton href="/enterprise/interviews">Back to interviews</ConsoleButton></ConsoleShell>;
  if (!config) return <ConsoleShell><ConsoleCard className="p-8">Loading interview…</ConsoleCard></ConsoleShell>;

  const meta = config.enterprise;
  return (
    <ConsoleShell
      eyebrow={`Interviews / ${meta?.status ?? 'Draft'}`}
      title={config.projectName}
      subtitle={`${meta?.role ?? 'Custom role'} · ${meta?.department ?? 'Custom department'}`}
      actions={<><button disabled={changingStatus} onClick={() => void changeArchiveState()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d9dde2] bg-white px-4 text-sm font-semibold hover:bg-[#f5f6f7] disabled:cursor-wait disabled:opacity-50">{meta?.status === 'archived' ? <RotateCcw size={15} /> : <Archive size={15} />}{changingStatus ? 'Updating…' : meta?.status === 'archived' ? 'Restore Interview' : 'Archive Interview'}</button><button disabled={deleting} onClick={() => void remove()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-50"><Trash2 size={15} />{deleting ? 'Deleting…' : 'Delete Interview'}</button><ConsoleButton onClick={edit} variant="outline">Edit Interview</ConsoleButton>{meta?.status === 'published' && <ConsoleButton href="/enterprise/invitations"><UserPlus size={15} /> Invite Candidate</ConsoleButton>}</>}
    >
      <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
        <div className="space-y-5">
          <ConsoleCard className="p-6">
            <h2 className="font-serif text-xl font-bold">Interview Structure</h2>
            <div className="mt-5 space-y-3">
              {(meta?.stages ?? []).map((stage, index) => (
                <div key={stage.id} className="flex items-center gap-3 rounded-lg border border-[#e3e6e9] p-4">
                  <span className="grid size-8 place-items-center rounded bg-[#eff1f3] text-xs font-bold">{index + 1}</span>
                  <b className="flex-1 text-sm">{stage.title}</b><span className="text-xs text-[#747981]">{stage.duration} min</span>
                </div>
              ))}
            </div>
          </ConsoleCard>
          <ConsoleCard className="p-6">
            <h2 className="font-serif text-xl font-bold">Panel</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {config.agents.map((agent) => <div key={agent.id} className="rounded-lg border border-[#e2e5e8] p-4"><b>{agent.identity.name}</b><p className="mt-1 text-xs text-[#737880]">{agent.identity.role} · {agent.logic.maxTurns} turns</p></div>)}
            </div>
          </ConsoleCard>
        </div>
        <div className="space-y-5">
          <ConsoleCard className="p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#777c84]">Status</p>
            <div className="mt-3"><StatusPill tone={meta?.status === 'published' ? 'green' : meta?.status === 'archived' ? 'gray' : 'amber'}>{meta?.status ?? 'draft'}</StatusPill></div>
            <dl className="mt-6 space-y-4 text-sm">
              {[
                ['Duration', `${meta?.duration ?? 0} min`],
                ['Questions', String(meta?.questions.filter((question) => question.selected).length ?? 0)],
                ['Interviewers', String(config.agents.length)],
                ['Language', config.language],
              ].map((item) => <div key={item[0]} className="flex justify-between"><dt className="text-[#747981]">{item[0]}</dt><dd className="font-semibold">{item[1]}</dd></div>)}
            </dl>
          </ConsoleCard>
          {meta?.publicCode && <ConsoleCard className="p-6"><p className="text-xs font-semibold uppercase tracking-wider text-[#777c84]">Invitation code</p><code className="mt-3 block rounded bg-[#f0f2f4] p-3 text-sm">{meta.publicCode}</code></ConsoleCard>}
        </div>
      </div>
    </ConsoleShell>
  );
}
