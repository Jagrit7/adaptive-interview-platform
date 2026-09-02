import { supabase } from './supabaseClient';

/**
 * Reading and writing interview reports.
 *
 * Same split as panels: the backend builds the report but never stores it. The
 * browser fetches it and writes it under the signed-in user's own session, so
 * FastAPI still holds no database credentials and Row Level Security still
 * governs every write.
 */

export interface CompetencyResult {
  name: string;
  score: number;
  threshold: number;
  weight: number;
  covered: boolean;
  checked_by: string[];
  used_default_rule: boolean;
}

export interface AgentReport {
  agent_id: string;
  name: string;
  role: string;
  visits: number;
  questions_answered: number;
  satisfaction: number;
  force_closed: boolean;
  competencies: string[];
  knowledge_questions_asked: number;
  knowledge_questions_total: number;
}

export interface TranscriptEntry {
  turn: number;
  speaker: string;
  agent_id: string;
  agent_name: string;
  text: string;
  flags: string[];
  coverage: number | null;
  knowledge_item_id: string | null;
}

export interface ReportTotals {
  overall_score: number;
  band: string;
  competencies_total: number;
  competencies_covered: number;
  coverage_rate: number;
  knowledge_coverage: number | null;
  questions_answered: number;
  flags: Record<string, number>;
}

export interface InterviewReport {
  session_id: string;
  candidate_name: string;
  candidate_ref: string;
  panel_name: string;
  language: string;
  started_at: string;
  finished_at: string;
  completed: boolean;
  totals: ReportTotals;
  competencies: CompetencyResult[];
  agents: AgentReport[];
  transcript: TranscriptEntry[];
}

export interface ReportSummary {
  id: string;
  candidate_name: string;
  candidate_ref: string;
  overall_score: number | null;
  band: string | null;
  completed: boolean;
  created_at: string;
  panel_name: string;
}

/**
 * Human-readable candidate code, e.g. AIP-8F3K2Q.
 *
 * Deliberately not a uuid: this gets read aloud, written on paper, and typed
 * into a search box. Ambiguous characters (0/O, 1/I) are excluded so a code
 * copied by hand still resolves. It identifies the sitting, not the person -
 * the same candidate interviewing twice gets two codes, which is what you want
 * when comparing attempts.
 */
export function generateCandidateRef(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `AIP-${body}`;
}

export async function saveReport(
  report: InterviewReport,
  panelId: string | null,
): Promise<string> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error('You are signed out, so the report could not be saved.');
  }

  // upsert on (user_id, session_id): the frontend may try twice - once when the
  // interview finishes and once when the user exits - and a report is a record
  // of one sitting, so the second attempt must update rather than duplicate.
  const { data, error } = await supabase
    .from('interview_reports')
    .upsert(
      {
        user_id: userData.user.id,
        panel_id: panelId,
        candidate_name: report.candidate_name,
        candidate_ref: report.candidate_ref,
        session_id: report.session_id,
        overall_score: report.totals.overall_score,
        band: report.totals.band,
        completed: report.completed,
        report,
      },
      { onConflict: 'user_id,session_id' },
    )
    .select('id')
    .single();

  if (error) throw new Error(`Could not save the report: ${error.message}`);
  return (data as { id: string }).id;
}

export async function listReports(): Promise<ReportSummary[]> {
  const { data, error } = await supabase
    .from('interview_reports')
    .select('id, candidate_name, candidate_ref, overall_score, band, completed, created_at, report')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Could not load reports: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    candidate_name: r.candidate_name as string,
    candidate_ref: r.candidate_ref as string,
    overall_score: r.overall_score as number | null,
    band: r.band as string | null,
    completed: r.completed as boolean,
    created_at: r.created_at as string,
    panel_name: (r.report as InterviewReport)?.panel_name ?? '',
  }));
}

export async function loadReport(id: string): Promise<InterviewReport> {
  const { data, error } = await supabase
    .from('interview_reports')
    .select('report')
    .eq('id', id)
    .single();
  if (error) throw new Error(`Could not open that report: ${error.message}`);
  return (data as { report: InterviewReport }).report;
}
