'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/ui/AuthGate';
import { ConsoleShell, ConsoleCard, ConsoleButton, StatusPill } from '@/components/console/ConsoleShell';
import { deletePanel, listPanels, type PanelSummary } from '@/lib/panels';
import { useBuilderStore } from '@/store/builderStore';

export default function PanelsPage() {
  return (
    <AuthGate>
      <PanelList />
    </AuthGate>
  );
}

function PanelList() {
  const router = useRouter();
  const { openPanel, newPanel } = useBuilderStore();
  const [panels, setPanels] = useState<PanelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPanels(await listPanels());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const open = async (id: string) => {
    try {
      await openPanel(id);
      router.push('/builder');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const create = () => {
    newPanel();          // clears panelId, so the first save inserts a new row
    router.push('/builder');
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deletePanel(id);
      setPanels((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <ConsoleShell
      breadcrumb="INTERVIEWS"
      title="Interview Templates"
      subtitle="Every panel saved to your account. Duplicate one to start from a shape that works."
      actions={<ConsoleButton onClick={create}>+ New interview</ConsoleButton>}
    >
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg text-sm border
                        border-[#dc2626] text-[#dc2626]">
          {error}
        </div>
      )}

      {loading && (
        <p className="text-sm text-[var(--color-console-ink-mute)]">Loading…</p>
      )}

      {!loading && panels.length === 0 && !error && (
        <ConsoleCard className="text-center py-14">
          <p className="font-serif text-xl font-bold mb-2">No interviews yet</p>
          <p className="text-sm text-[var(--color-console-ink-soft)] mb-6">
            Build a panel and it will appear here.
          </p>
          <ConsoleButton onClick={create}>Build your first one</ConsoleButton>
        </ConsoleCard>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {panels.map((p) => (
          <ConsoleCard key={p.id} className="flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="font-serif text-xl font-bold leading-snug">
                {p.project_name}
              </h2>
              <StatusPill tone="active">Saved</StatusPill>
            </div>

            <dl className="space-y-2 text-sm mb-6">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-console-ink-mute)]">Interviewers</dt>
                <dd className="font-medium">{p.agentCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-console-ink-mute)]">Language</dt>
                <dd className="font-medium">{p.language}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-console-ink-mute)]">Last edited</dt>
                <dd className="font-medium">
                  {new Date(p.updated_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>

            <div className="mt-auto flex gap-2">
              <button onClick={() => open(p.id)}
                      className="flex-1 px-5 py-2.5 rounded-lg text-sm font-semibold
                                 bg-[var(--color-console-accent)] text-white
                                 hover:brightness-150 transition">
                Open
              </button>
              <button onClick={() => remove(p.id, p.project_name)}
                      className="px-4 py-2.5 rounded-lg text-sm
                                 border border-[var(--color-console-border)]
                                 text-[var(--color-console-ink-soft)]
                                 hover:bg-[var(--color-console-bg)] transition">
                Delete
              </button>
            </div>
          </ConsoleCard>
        ))}
      </div>
    </ConsoleShell>
  );
}
