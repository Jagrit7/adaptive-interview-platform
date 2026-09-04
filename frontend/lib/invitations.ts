import { supabase } from './supabaseClient';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export type InvitationStatus = 'pending' | 'started' | 'completed' | 'revoked';

export interface Invitation {
  id: string;
  panel_id: string;
  email: string;
  candidate_name: string;
  token: string;
  status: InvitationStatus;
  attempts: number;
  max_attempts: number;
  expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  session_id: string | null;
  report_id: string | null;
  created_at: string;
}

/** What a candidate holding a token is allowed to see before confirming. */
export interface InvitationSummary {
  panel_name: string;
  role: string;
  language: string;
  candidate_name: string;
  email_hint: string;
  attempts_used: number;
  attempts_allowed: number;
  expires_at: string | null;
}

export interface InvitationPanelView {
  panel_name: string;
  role: string;
  language: string;
  candidate_name: string;
  candidate_email: string;
  agents: Array<{ id: string; identity: Record<string, unknown>; turnTaking: Record<string, unknown> }>;
}

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const looksLikeEmail = (value: string) => EMAIL_SHAPE.test(normalizeEmail(value));

/**
 * 256 bits from the platform CSPRNG, base64url-encoded to 43 characters.
 *
 * This token *is* the candidate's credential, so the generator matters. It is
 * not `Math.random`, and it is not `crypto.randomUUID().slice(0, 8)` - which is
 * what the old shared invite code used, and which is 32 bits: small enough to
 * enumerate. At 256 bits, guessing is not a threat model.
 */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function invitationLink(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/interview-room?invite=${encodeURIComponent(token)}`;
}

/** Split a pasted blob of addresses on commas, semicolons, or newlines. */
export function parseEmailList(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[\s,;]+/)
    .map(normalizeEmail)
    .filter(value => value && looksLikeEmail(value))
    .filter(value => (seen.has(value) ? false : (seen.add(value), true)));
}

const COLUMNS =
  'id,panel_id,email,candidate_name,token,status,attempts,max_attempts,expires_at,started_at,completed_at,session_id,report_id,created_at';

export async function listInvitations(panelId?: string): Promise<Invitation[]> {
  let request = supabase.from('interview_invitations').select(COLUMNS).order('created_at', { ascending: false });
  if (panelId) request = request.eq('panel_id', panelId);
  const { data, error } = await request;
  if (error) throw new Error(`Could not load invitations: ${error.message}`);
  return (data ?? []) as Invitation[];
}

/**
 * Invite one or more addresses to a panel.
 *
 * Upserts on `(panel_id, email)`, so re-inviting somebody updates their row
 * rather than issuing a second link that competes with the first. The token is
 * only regenerated when there was none - re-inviting must not silently break a
 * link the candidate may already have open.
 */
export async function inviteCandidates(
  panelId: string,
  emails: string[],
  options: { expiresInDays?: number; attempts?: number } = {},
): Promise<Invitation[]> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error('You are signed out, so invitations could not be created.');

  const clean = emails.map(normalizeEmail).filter(looksLikeEmail);
  if (!clean.length) throw new Error('No valid email addresses were given.');

  const existing = await listInvitations(panelId);
  const byEmail = new Map(existing.map(row => [row.email, row]));

  const expiresInDays = options.expiresInDays ?? 0;
  const expires_at = expiresInDays > 0
    ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
    : null;

  const rows = clean.map(email => ({
    user_id: userData.user!.id,
    panel_id: panelId,
    email,
    candidate_name: byEmail.get(email)?.candidate_name ?? nameFromEmail(email),
    token: byEmail.get(email)?.token ?? generateInviteToken(),
    max_attempts: Math.max(1, options.attempts ?? 1),
    expires_at,
  }));

  const { data, error } = await supabase
    .from('interview_invitations')
    .upsert(rows, { onConflict: 'panel_id,email' })
    .select(COLUMNS);
  if (error) throw new Error(`Could not create invitations: ${error.message}`);
  return (data ?? []) as Invitation[];
}

/**
 * Revoke rather than delete.
 *
 * Deleting would drop the record that this person was ever invited, which is
 * exactly what you want to keep after you have withdrawn someone's access.
 */
export async function revokeInvitation(id: string): Promise<void> {
  const { error } = await supabase
    .from('interview_invitations')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Could not revoke that invitation: ${error.message}`);
}

export async function reinstateInvitation(id: string): Promise<void> {
  const { error } = await supabase
    .from('interview_invitations')
    .update({ status: 'pending', revoked_at: null })
    .eq('id', id);
  if (error) throw new Error(`Could not restore that invitation: ${error.message}`);
}

/** Best-effort display name, editable later; never used for authorisation. */
function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

/* ---------------- candidate side (anonymous, backend-mediated) ---------------- */

async function candidateFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'This interview link could not be opened.');
  }
  return data as T;
}

export function loadInvitationSummary(token: string): Promise<InvitationSummary> {
  return candidateFetch(`/invitations/${encodeURIComponent(token)}`);
}

export function verifyInvitation(token: string, email: string): Promise<InvitationPanelView> {
  return candidateFetch(`/invitations/${encodeURIComponent(token)}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizeEmail(email) }),
  });
}
