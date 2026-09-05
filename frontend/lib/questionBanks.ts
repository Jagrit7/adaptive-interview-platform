import { supabase } from './supabaseClient';
import type { KnowledgeItem } from '@/store/builderStore';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

/** Mirrors QuestionDomain in backend/app/schemas/panel.py. */
export type BankDomain = 'dsa' | 'system_design' | 'behavioural' | 'product' | 'customer' | 'general';
export type QuestionKind = 'coding' | 'written' | 'verbal';

export const BANK_DOMAINS: { value: BankDomain; label: string }[] = [
  { value: 'behavioural', label: 'Behavioural' },
  { value: 'system_design', label: 'System design' },
  { value: 'dsa', label: 'DSA / algorithms' },
  { value: 'product', label: 'Product' },
  { value: 'customer', label: 'Customer' },
  { value: 'general', label: 'General' },
];

export interface UserBank {
  id: string;
  name: string;
  domain: BankDomain;
  description: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

export interface UserBankItem {
  id: string;
  bank_id: string;
  question: string;
  ideal_answer: string;
  kind: QuestionKind;
  domain: BankDomain;
  difficulty: number | null;
  tags: string[];
  position: number;
}

/**
 * The panel-config bankId for one of the user's own banks.
 *
 * Prefixed rather than a bare UUID so it never collides with a built-in id, and
 * so `withEnterpriseQuestionBank` leaves the agent alone - that helper only
 * rewrites agents whose bankId is empty or the literal 'custom'.
 */
export const userBankId = (id: string) => `user:${id}`;
export const isUserBankId = (value: string | undefined): value is string =>
  typeof value === 'string' && value.startsWith('user:');
export const bankIdToUuid = (value: string) => value.replace(/^user:/, '');

const BANK_COLUMNS = 'id,name,domain,description,created_at,updated_at';

async function requireUser(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('You are signed out, so your question banks could not be loaded.');
  return data.user.id;
}

export async function listUserBanks(): Promise<UserBank[]> {
  const { data, error } = await supabase
    .from('user_question_banks')
    .select(`${BANK_COLUMNS},user_question_bank_items(count)`)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not load your question banks: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => {
    const counts = row.user_question_bank_items as { count: number }[] | undefined;
    return { ...(row as unknown as UserBank), item_count: counts?.[0]?.count ?? 0 };
  });
}

export async function listBankItems(bankId: string): Promise<UserBankItem[]> {
  const { data, error } = await supabase
    .from('user_question_bank_items')
    .select('id,bank_id,question,ideal_answer,kind,domain,difficulty,tags,position')
    .eq('bank_id', bankId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not load that bank's questions: ${error.message}`);
  return (data ?? []) as UserBankItem[];
}

export async function createBank(
  name: string, domain: BankDomain, description = '',
): Promise<UserBank> {
  const userId = await requireUser();
  const { data, error } = await supabase
    .from('user_question_banks')
    .insert({ user_id: userId, name: name.trim(), domain, description })
    .select(BANK_COLUMNS)
    .single();
  if (error) {
    // 23505 is the unique index on (user_id, lower(trim(name))).
    if (error.code === '23505') throw new Error(`You already have a bank called "${name.trim()}".`);
    throw new Error(`Could not create that bank: ${error.message}`);
  }
  return { ...(data as UserBank), item_count: 0 };
}

export async function deleteBank(bankId: string): Promise<void> {
  const { error } = await supabase.from('user_question_banks').delete().eq('id', bankId);
  if (error) throw new Error(`Could not delete that bank: ${error.message}`);
}

/**
 * Append questions to a bank.
 *
 * The item's `kind` is what decides whether the candidate is asked out loud or
 * given a writing pad, so it is carried per item rather than per bank: a
 * behavioural bank is usually all verbal, but a system-design one is normally a
 * mix, and forcing one kind on the whole bank would make half of it unusable.
 */
export async function addBankItems(
  bankId: string, domain: BankDomain, items: Array<Partial<UserBankItem> & { question: string }>,
): Promise<number> {
  const userId = await requireUser();
  const existing = await listBankItems(bankId);
  const rows = items
    .filter(item => item.question?.trim())
    .map((item, index) => ({
      bank_id: bankId,
      user_id: userId,
      question: item.question.trim(),
      ideal_answer: (item.ideal_answer ?? '').trim(),
      kind: item.kind ?? 'verbal',
      domain: item.domain ?? domain,
      difficulty: item.difficulty ?? null,
      tags: item.tags ?? [],
      position: existing.length + index,
    }));
  if (!rows.length) throw new Error('No usable questions were found.');
  const { error } = await supabase.from('user_question_bank_items').insert(rows);
  if (error) throw new Error(`Could not save those questions: ${error.message}`);
  return rows.length;
}

export async function deleteBankItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('user_question_bank_items').delete().eq('id', itemId);
  if (error) throw new Error(`Could not delete that question: ${error.message}`);
}

/**
 * Parse an uploaded file into questions, reusing the backend parser.
 *
 * Deliberately not a second parser in the browser: /knowledge/parse already
 * handles CSV, TSV, JSON, JSONL, Markdown and plain text, including
 * header-less files and column aliases. A browser-side reimplementation would
 * accept a different set of files than the one the interview itself uses.
 */
export async function parseQuestionFile(file: File): Promise<Array<{ question: string; idealAnswer: string; tags: string[]; kind?: QuestionKind; difficulty?: number | null }>> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(`${BACKEND_URL}/knowledge/parse`, { method: 'POST', body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'That file could not be read.');
  }
  const items = (data.items ?? []) as KnowledgeItem[];
  return items.map(item => ({
    question: item.question,
    idealAnswer: item.idealAnswer ?? '',
    tags: item.tags ?? [],
    kind: (item.kind as QuestionKind | undefined),
    difficulty: item.difficulty ?? null,
  }));
}

/** Split pasted text into one question per line. */
export function parsePastedQuestions(raw: string): string[] {
  return raw.split(/\r?\n/).map(line => line.replace(/^\s*[-*\d.)\]]+\s*/, '').trim()).filter(Boolean);
}

/** The bank's questions in the shape a panel config stores. */
export function bankItemsToKnowledge(items: UserBankItem[]): KnowledgeItem[] {
  return items.map(item => ({
    id: item.id,
    question: item.question,
    idealAnswer: item.ideal_answer,
    tags: item.tags,
    difficulty: item.difficulty ?? undefined,
    kind: item.kind,
    domain: item.domain,
  })) as KnowledgeItem[];
}
