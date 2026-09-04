'use client';

/**
 * The email confirmation a candidate passes before the interview loads.
 *
 * The gate is not the security boundary - the backend re-checks the token and
 * the address on every subsequent call, and would reject a session started
 * without them. What this screen buys is that a mistyped address costs nothing:
 * verification is a separate endpoint from starting, so the attempt counter is
 * only touched once the candidate is actually going in.
 *
 * The invited address is shown masked (`p***a@acme.com`). Someone who was
 * forwarded a link should be able to tell it is not theirs, without the page
 * handing them the answer.
 */

import { useEffect, useState } from 'react';
import {
  loadInvitationSummary,
  verifyInvitation,
  looksLikeEmail,
  type InvitationPanelView,
  type InvitationSummary,
} from '@/lib/invitations';

export function InvitationGate({
  token,
  onVerified,
}: {
  token: string;
  onVerified: (panel: InvitationPanelView, email: string) => void;
}) {
  const [summary, setSummary] = useState<InvitationSummary | null>(null);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    loadInvitationSummary(token)
      .then(data => { if (active) setSummary(data); })
      .catch(reason => { if (active) setLoadError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [token]);

  const submit = async () => {
    if (!looksLikeEmail(email) || checking) return;
    setChecking(true);
    setError('');
    try {
      const panel = await verifyInvitation(token, email);
      onVerified(panel, panel.candidate_email);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setChecking(false);
    }
  };

  if (loadError) return <Centered><Panel><h1 className="font-serif text-2xl font-bold text-[#17181a]">Interview unavailable</h1><p className="mt-3 text-sm leading-6 text-[#676c74]">{loadError}</p></Panel></Centered>;
  if (!summary) return <Centered><p className="text-sm text-[#aeb5c7]">Checking your invitation…</p></Centered>;

  const attemptsLeft = Math.max(0, summary.attempts_allowed - summary.attempts_used);

  return (
    <Centered>
      <Panel>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#777c84]">Interview invitation</p>
        <h1 className="mt-2 font-serif text-2xl font-bold text-[#17181a]">{summary.panel_name || 'Interview'}</h1>
        {summary.candidate_name && (
          <p className="mt-1 text-sm text-[#676c74]">Invited: {summary.candidate_name}</p>
        )}

        <p className="mt-6 text-sm leading-6 text-[#50555d]">
          Confirm the email address this invitation was sent to. It should look like{' '}
          <b className="font-mono text-[13px]">{summary.email_hint}</b>.
        </p>

        <label htmlFor="invite-email" className="mt-5 block text-xs font-semibold uppercase tracking-wider text-[#777c84]">
          Your email address
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          autoFocus
          autoComplete="email"
          onChange={event => { setEmail(event.target.value); setError(''); }}
          onKeyDown={event => { if (event.key === 'Enter') void submit(); }}
          placeholder="name@company.com"
          className="mt-2 h-11 w-full rounded-lg border border-[#dfe2e6] px-3 text-sm outline-none focus:border-[#9aa1a9]"
        />

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        <button
          onClick={() => void submit()}
          disabled={!looksLikeEmail(email) || checking}
          className="mt-5 h-11 w-full rounded-lg bg-black text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#c8ccd1]"
        >
          {checking ? 'Checking…' : 'Continue'}
        </button>

        <p className="mt-5 border-t border-[#e6e8eb] pt-4 text-xs leading-5 text-[#777c84]">
          {attemptsLeft === 1
            ? 'You have one attempt at this interview.'
            : `You have ${attemptsLeft} attempts remaining.`}
          {summary.expires_at && ` This invitation expires on ${new Date(summary.expires_at).toLocaleDateString()}.`}
          {' '}This link was issued to you personally and should not be shared.
        </p>
      </Panel>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-[#f7f8fa] px-6">{children}</div>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="w-full max-w-[460px] rounded-xl border border-[#e3e5e8] bg-white p-8">{children}</div>;
}
