'use client';

/**
 * The real Invitations screen.
 *
 * Replaces the static fixture that used to live in `EnterpriseScreens.tsx`,
 * which rendered four hardcoded names and had buttons that did nothing. Under
 * the shared-link model there was nothing for it to show: one code authorised
 * everybody, so there was no per-candidate state to track. Now there is.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, Link2, RotateCcw, Send, UserPlus, XCircle } from 'lucide-react';
import { AuthGate } from '@/components/ui/AuthGate';
import { listPanels, type PanelSummary } from '@/lib/panels';
import {
  inviteCandidates,
  invitationLink,
  listInvitations,
  parseEmailList,
  revokeInvitation,
  reinstateInvitation,
  type Invitation,
} from '@/lib/invitations';
import { ConsoleCard, ConsoleShell, StatusPill } from './ConsoleShell';

export function EnterpriseInvitationsClient() {
  return <AuthGate role="enterprise"><InvitationsInner /></AuthGate>;
}

const TONE: Record<Invitation['status'], 'green' | 'blue' | 'amber'> = {
  pending: 'amber', started: 'blue', completed: 'green', revoked: 'amber',
};

function InvitationsInner() {
  const [panels, setPanels] = useState<PanelSummary[]>([]);
  const [rows, setRows] = useState<Invitation[]>([]);
  const [panelId, setPanelId] = useState('');
  const [emails, setEmails] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [panelRows, inviteRows] = await Promise.all([listPanels(), listInvitations()]);
        if (!active) return;
        // Only a published interview can be sat, so only a published interview
        // is worth inviting anyone to.
        const open = panelRows.filter(panel => panel.status === 'published');
        setPanels(open);
        setPanelId(current => current || open[0]?.id || '');
        setRows(inviteRows);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const parsed = useMemo(() => parseEmailList(emails), [emails]);
  const panelName = (id: string) => panels.find(panel => panel.id === id)?.project_name ?? 'Interview';

  const send = async () => {
    if (!panelId || !parsed.length || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await inviteCandidates(panelId, parsed);
      setRows(await listInvitations());
      setEmails('');
      setNotice(`${parsed.length} invitation${parsed.length === 1 ? '' : 's'} ready. Copy each link and send it to that candidate.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (row: Invitation, revoke: boolean) => {
    setError('');
    try {
      await (revoke ? revokeInvitation(row.id) : reinstateInvitation(row.id));
      setRows(await listInvitations());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <ConsoleShell
      title="Candidate Invitations"
      subtitle="Each candidate gets their own link. Only the address it was issued to can use it."
    >
      <ConsoleCard className="mb-5 p-6">
        <h2 className="font-serif text-xl font-bold">Invite candidates</h2>
        {panels.length === 0 && !loading ? (
          <p className="mt-4 text-sm text-[#676c74]">
            No published interviews yet. <Link href="/enterprise/interviews" className="font-semibold underline">Publish one</Link> before inviting candidates.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_280px_auto] lg:items-end">
            <div>
              <label htmlFor="invite-emails" className="text-xs font-semibold uppercase tracking-wider text-[#777c84]">Email addresses</label>
              <textarea
                id="invite-emails"
                value={emails}
                onChange={event => setEmails(event.target.value)}
                rows={3}
                placeholder={'priya@acme.com, ravi@acme.com\nmeera@acme.com'}
                className="mt-2 w-full rounded-lg border border-[#dfe2e6] p-3 text-sm outline-none focus:border-[#9aa1a9]"
              />
              <p className="mt-1 text-xs text-[#858a92]">
                {parsed.length ? `${parsed.length} valid address${parsed.length === 1 ? '' : 'es'} recognised` : 'Separate with commas, spaces, or new lines'}
              </p>
            </div>
            <div>
              <label htmlFor="invite-panel" className="text-xs font-semibold uppercase tracking-wider text-[#777c84]">Interview</label>
              <select
                id="invite-panel"
                value={panelId}
                onChange={event => setPanelId(event.target.value)}
                className="mt-2 h-11 w-full rounded-lg border border-[#dfe2e6] px-3 text-sm"
              >
                {panels.map(panel => <option key={panel.id} value={panel.id}>{panel.project_name}</option>)}
              </select>
            </div>
            <button
              onClick={() => void send()}
              disabled={busy || !parsed.length || !panelId}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-black px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#c8ccd1]"
            >
              <Send size={16} /> {busy ? 'Creating…' : 'Create invitations'}
            </button>
          </div>
        )}
        {notice && <p className="mt-4 rounded-lg bg-[#e7f5eb] px-4 py-3 text-sm text-[#256134]">{notice}</p>}
        {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      </ConsoleCard>

      <ConsoleCard className="overflow-hidden">
        <div className="flex items-center justify-between p-6">
          <h2 className="font-serif text-xl font-bold">Invitations</h2>
          <span className="text-sm text-[#777c84]">{rows.length} total</span>
        </div>
        {loading && <p className="border-t border-[#e5e7ea] p-8 text-sm text-[#737880]">Loading invitations…</p>}
        {!loading && rows.length === 0 && (
          <div className="grid min-h-[260px] place-items-center border-t border-[#e5e7ea] p-10 text-center">
            <div>
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#f0f2f4]"><UserPlus size={28} strokeWidth={1.4} /></span>
              <h3 className="mt-5 font-serif text-xl font-bold">Nobody invited yet</h3>
              <p className="mt-2 max-w-sm text-sm text-[#676c74]">Add addresses above. Each candidate gets a private link that only works for them.</p>
            </div>
          </div>
        )}
        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-y border-[#e5e7ea] bg-[#fafbfc] text-left text-xs uppercase tracking-wider text-[#777c84]">
                <tr>
                  <th className="px-6 py-3">Candidate</th>
                  <th className="px-6 py-3">Interview</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Attempts</th>
                  <th className="px-6 py-3">Link</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-[#e8eaed]">
                    <td className="px-6 py-4">
                      <b>{row.candidate_name || row.email}</b>
                      <p className="text-xs text-[#858a92]">{row.email}</p>
                    </td>
                    <td className="px-6 py-4">{panelName(row.panel_id)}</td>
                    <td className="px-6 py-4">
                      <StatusPill tone={TONE[row.status]}>{row.status === 'revoked' ? 'Revoked' : row.status[0].toUpperCase() + row.status.slice(1)}</StatusPill>
                    </td>
                    <td className="px-6 py-4 text-[#686d75]">{row.attempts} / {row.max_attempts}</td>
                    <td className="px-6 py-4">
                      {row.status === 'revoked'
                        ? <span className="text-xs text-[#858a92]">Link disabled</span>
                        : <CopyLink token={row.token} />}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-3">
                        {row.report_id && (
                          <Link href={`/enterprise/reports/${row.report_id}`} className="text-sm font-semibold hover:underline">Report</Link>
                        )}
                        {row.status === 'revoked'
                          ? <button onClick={() => void setStatus(row, false)} className="inline-flex items-center gap-1 text-sm font-semibold text-[#555a62] hover:underline"><RotateCcw size={14} /> Restore</button>
                          : <button onClick={() => void setStatus(row, true)} className="inline-flex items-center gap-1 text-sm font-semibold text-red-700 hover:underline"><XCircle size={14} /> Revoke</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ConsoleCard>

      <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-[#777c84]">
        <Link2 size={14} className="mt-0.5 shrink-0" />
        Each link carries a 256-bit token issued to one address. Before starting, the candidate
        must confirm the email it was sent to, so a forwarded link is not enough on its own.
        Revoking takes effect immediately, including mid-interview.
      </p>
    </ConsoleShell>
  );
}

function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(invitationLink(token));
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-[#dfe2e6] px-2.5 py-1.5 text-xs font-semibold hover:bg-[#f5f6f7]"
    >
      <Copy size={13} /> {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
