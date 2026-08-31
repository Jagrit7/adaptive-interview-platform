'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate, SignOutButton } from '@/components/ui/AuthGate';
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
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Your panels
        </h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={create}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: 500,
              fontSize: '14px', cursor: 'pointer',
              backgroundColor: 'var(--text-primary)', color: 'var(--bg)',
            }}
          >
            New panel
          </button>
          <SignOutButton />
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '20px',
          border: '1px solid var(--accent-rose)', color: 'var(--accent-rose)', fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {loading && <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading...</p>}

      {!loading && panels.length === 0 && !error && (
        <div style={{
          padding: '48px', textAlign: 'center', borderRadius: '12px',
          border: '1px dashed var(--border)', color: 'var(--text-secondary)',
        }}>
          <p style={{ margin: '0 0 16px' }}>You haven&apos;t saved a panel yet.</p>
          <button
            onClick={create}
            style={{
              padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
              border: '1px solid var(--border)', backgroundColor: 'transparent',
              color: 'var(--text-primary)', fontSize: '14px',
            }}
          >
            Build your first one
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {panels.map((p) => (
          <div
            key={p.id}
            style={{
              display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px',
              border: '1px solid var(--border)', borderRadius: '10px',
              backgroundColor: 'var(--surface)',
            }}
          >
            <button
              onClick={() => open(p.id)}
              style={{
                flex: 1, textAlign: 'left', background: 'none', border: 'none',
                cursor: 'pointer', padding: 0,
              }}
            >
              <div style={{ fontWeight: 500, fontSize: '15px', color: 'var(--text-primary)' }}>
                {p.project_name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {p.agentCount} agent{p.agentCount === 1 ? '' : 's'} &middot; {p.language} &middot;{' '}
                edited {new Date(p.updated_at).toLocaleDateString()}
              </div>
            </button>
            <button
              onClick={() => remove(p.id, p.project_name)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: '13px', padding: '4px 8px',
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = 'var(--accent-rose)')}
              onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
