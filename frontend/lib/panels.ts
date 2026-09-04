import { supabase } from './supabaseClient';
import type { Agent, Scorer } from '@/store/builderStore';
import { inferQuestionDomain } from './questionDomains';

/**
 * Every read and write of the `panels` table goes through here.
 *
 * The whole builder state lands in one jsonb `config` column rather than being
 * spread across relational tables. That is the right call for this shape of
 * data: the panel is only ever read and written as a complete unit, it is
 * handed to the backend as a single JSON object anyway, and the schema is still
 * changing weekly. `language` and per-agent `knowledge` were added without a
 * migration precisely because of this.
 *
 * Do NOT set user_id from the client's own state. It is read from the live
 * session below so it always matches the JWT the RLS policy checks against.
 */

export interface PanelConfig {
  projectName: string;
  language: string;
  agents: Agent[];
  scorer: Scorer;
  flow?: {
    version: 1;
    host: {
      name: string;
      systemPrompt: string;
      introFields: string[];
      openingInstruction: string;
      closingInstruction: string;
      voiceId?: string | null;
    };
    steps: Array<{
      id: string;
      agentId: string;
      questionKinds: Array<'verbal' | 'written' | 'coding'>;
      questionCount: number;
      maxRetriesPerQuestion: number;
      vagueProbe: boolean;
      satisfactionThreshold: number;
      handoffCondition: string;
    }>;
  };
  /** RecruitPro builder metadata. Kept inside config JSONB so the visual
   * workflow can evolve without a database migration for every new field. */
  enterprise?: {
    status: 'draft' | 'published' | 'archived';
    role: string;
    department: string;
    seniority: string;
    duration: number;
    description: string;
    skills: string[];
    stages: Array<{ id: string; title: string; duration: number }>;
    questions: Array<{ id: string; text: string; category: string; difficulty: string; selected: boolean }>;
    /** @deprecated Read only when upgrading panels saved before agent weights. */
    rubric?: Array<{ id: string; name: string; weight: number; description: string }>;
    candidateSettings: {
      expiresInDays: number;
      attempts: number;
      cameraRequired: boolean;
      identityCheck: boolean;
      integrityMonitoring: boolean;
      instructions: string;
    };
    publishedAt?: string;
    publicCode?: string;
    archivedFrom?: 'draft' | 'published';
  };
}

export interface PanelRow {
  id: string;
  user_id: string;
  project_name: string;
  config: PanelConfig;
  created_at: string;
  updated_at: string;
}

/** Summary shape for the panel list - avoids pulling every config down. */
export interface PanelSummary {
  id: string;
  project_name: string;
  updated_at: string;
  agentCount: number;
  language: string;
  status: 'draft' | 'published' | 'archived';
  role: string;
}

export type PanelLifecycleStatus = PanelSummary['status'];

const difficultyNumber = (value: string) => {
  const levels: Record<string, number> = { easy: 2, medium: 5, hard: 8 };
  return levels[value.trim().toLowerCase()] ?? 5;
};

/** Converts RecruitPro's reviewed question list into the canonical runtime
 * question bank. This also upgrades panels saved before written-question
 * delivery was introduced, without mutating their stored JSON. */
export function withEnterpriseQuestionBank(config: PanelConfig): PanelConfig {
  const selected = config.enterprise?.questions.filter((question) => question.selected) ?? [];
  if (selected.length === 0) return config;

  const items = selected.map((question) => ({
    id: question.id,
    question: question.text,
    idealAnswer: '',
    tags: [question.category, question.difficulty],
    difficulty: difficultyNumber(question.difficulty),
    domain: inferQuestionDomain(question.category, question.text),
  }));

  return {
    ...config,
    agents: config.agents.map((agent) => agent.knowledge.bankId && agent.knowledge.bankId !== 'custom' ? agent : ({
      ...agent,
      knowledge: {
        mode: 'knowledge_base',
        strict: true,
        sourceName: 'RecruitPro reviewed questions',
        bankId: 'custom',
        // New saves already contain the role-filtered private bank. Fall back
        // to the legacy shared list only while upgrading an older panel.
        items: agent.knowledge.items.length ? agent.knowledge.items : items,
      },
    })),
  };
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('You are signed out. Sign in again to save.');
  }
  return data.user.id;
}

/** Newest first. Selects config->agents length server-side is not worth it at
 *  this scale, so the whole config comes back and is summarised here. */
export async function listPanels(): Promise<PanelSummary[]> {
  const { data, error } = await supabase
    .from('panels')
    .select('id, project_name, updated_at, config')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Could not load your panels: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    project_name: row.project_name as string,
    updated_at: row.updated_at as string,
    agentCount: (row.config as PanelConfig)?.agents?.length ?? 0,
    language: (row.config as PanelConfig)?.language ?? 'en-US',
    status: (row.config as PanelConfig)?.enterprise?.status ?? 'draft',
    role: (row.config as PanelConfig)?.enterprise?.role ?? 'Custom role',
  }));
}

export async function loadPanel(id: string): Promise<PanelRow> {
  const { data, error } = await supabase
    .from('panels')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(`Could not open that panel: ${error.message}`);
  return data as PanelRow;
}

/**
 * Insert on first save, update afterwards.
 *
 * Not `upsert`: upsert without a stable client-generated id silently inserts a
 * new row on every save, which is how you end up with forty copies of the same
 * panel. Branching on whether we already hold an id is explicit and cheaper.
 *
 * Returns the row id so the store can hold onto it for subsequent saves.
 */
export async function savePanel(
  panelId: string | null,
  config: PanelConfig,
): Promise<string> {
  const projectName = config.projectName?.trim() || 'Untitled panel';

  if (panelId) {
    const { data, error } = await supabase
      .from('panels')
      .update({ project_name: projectName, config })
      .eq('id', panelId)
      .select('id')
      .single();

    // A zero-row update means the panel was deleted elsewhere, or belongs to
    // another account and RLS filtered it out. Falling through to an insert
    // would be wrong - it would silently fork someone's work - so this reports
    // instead.
    if (error) throw new Error(`Could not save: ${error.message}`);
    return (data as { id: string }).id;
  }

  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from('panels')
    .insert({ user_id, project_name: projectName, config })
    .select('id')
    .single();

  if (error) throw new Error(`Could not save: ${error.message}`);
  return (data as { id: string }).id;
}

export async function deletePanel(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('panels')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Could not delete that panel: ${error.message}`);
  // Supabase RLS intentionally turns an unauthorized target into zero visible
  // rows. Treat that as a failure instead of falsely removing the panel only
  // from the browser and claiming the database deletion succeeded.
  if (!data) throw new Error('That panel was not found or you do not have permission to delete it.');
}

/** Changes lifecycle state without rebuilding or losing any panel content.
 * Publishing remains a builder-only operation because it must pass the full
 * builder validation first. This function therefore accepts only archive and
 * restore transitions from management screens. */
export async function setPanelArchived(id: string, archived: boolean): Promise<PanelLifecycleStatus> {
  const row = await loadPanel(id);
  const enterprise = row.config.enterprise;
  if (!enterprise) {
    throw new Error('This legacy panel must be opened and saved in RecruitPro before its lifecycle can be changed.');
  }

  const nextStatus: PanelLifecycleStatus = archived
    ? 'archived'
    : enterprise.archivedFrom ?? (enterprise.publishedAt ? 'published' : 'draft');
  const config: PanelConfig = {
    ...row.config,
    enterprise: {
      ...enterprise,
      status: nextStatus,
      archivedFrom: archived
        ? (enterprise.status === 'published' ? 'published' : 'draft')
        : undefined,
    },
  };

  const { data, error } = await supabase
    .from('panels')
    .update({ config })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Could not ${archived ? 'archive' : 'restore'} that panel: ${error.message}`);
  if (!data) throw new Error('That panel was not found or you do not have permission to update it.');
  return nextStatus;
}
