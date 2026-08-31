import { supabase } from './supabaseClient';
import type { Agent, Scorer } from '@/store/builderStore';

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
  const { error } = await supabase.from('panels').delete().eq('id', id);
  if (error) throw new Error(`Could not delete that panel: ${error.message}`);
}
