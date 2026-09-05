import { supabase } from './supabaseClient';

/**
 * The player-facing progression system: XP, levels, weekly leagues, gems and
 * trophies.
 *
 * Every number here is read from Supabase, never computed and posted by the
 * browser. `award_interview_xp`, `touch_daily_activity` and `spend_gems` are
 * SECURITY DEFINER functions that derive the award from the stored report and
 * the current balance; the browser has no INSERT on either ledger. The
 * formulas mirrored below are for display only - showing a player what the next
 * level costs - and are never the source of a written value.
 */

export interface PlayerProfile {
  user_id: string;
  display_name: string;
  total_xp: number;
  gems: number;
  streak_days: number;
  longest_streak: number;
  last_active_on: string | null;
  is_premium: boolean;
  premium_until: string | null;
}

export interface LeagueTier { tier: number; name: string; promote_count: number; demote_count: number; promotion_gems: number }
export interface LeaderboardRow { user_id: string; display_name: string; weekly_xp: number; level: number; is_premium: boolean; rank: number; you: boolean }
export interface LeagueStanding { cohortId: string; tier: LeagueTier; seasonEndsOn: string; rows: LeaderboardRow[] }
export interface Trophy { code: string; name: string; description: string; hint: string; xp_reward: number; gem_reward: number; display_order: number; earned_at: string | null }
export interface XpAward { xp: number; total_xp?: number; level?: number; gems?: number; trophies?: string[]; reason?: string }

/* ---------------------------------------------------------- display maths ---- */

/** Mirrors public.level_for_xp. Display only. */
export const levelForXp = (xp: number) => Math.max(1, Math.floor(Math.sqrt(Math.max(xp, 0) / 25)) + 1);
/** Mirrors public.xp_for_level. Display only. */
export const xpForLevel = (level: number) => (Math.max(level, 1) - 1) ** 2 * 25;

export function levelProgress(totalXp: number) {
  const level = levelForXp(totalXp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const span = Math.max(1, ceiling - floor);
  return {
    level,
    into: totalXp - floor,
    needed: span,
    toNext: Math.max(0, ceiling - totalXp),
    percent: Math.min(100, Math.round(((totalXp - floor) / span) * 100)),
  };
}

/* ----------------------------------------------------------------- reads ---- */

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('You are signed out.');
  return data.user.id;
}

export async function loadProfile(): Promise<PlayerProfile> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('player_profiles')
    .select('user_id,display_name,total_xp,gems,streak_days,longest_streak,last_active_on,is_premium,premium_until')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Could not load your profile: ${error.message}`);
  // A player who has never finished an interview has no row yet. Returning a
  // zeroed profile keeps every screen renderable rather than making each one
  // handle "no profile" separately.
  return (data as PlayerProfile) ?? {
    user_id: userId, display_name: '', total_xp: 0, gems: 0, streak_days: 0,
    longest_streak: 0, last_active_on: null, is_premium: false, premium_until: null,
  };
}

export async function loadTrophies(): Promise<Trophy[]> {
  const userId = await currentUserId();
  const [{ data: all, error: allError }, { data: mine, error: mineError }] = await Promise.all([
    supabase.from('trophies').select('code,name,description,hint,xp_reward,gem_reward,display_order').order('display_order'),
    supabase.from('user_trophies').select('trophy_code,earned_at').eq('user_id', userId),
  ]);
  if (allError) throw new Error(`Could not load trophies: ${allError.message}`);
  if (mineError) throw new Error(`Could not load your trophies: ${mineError.message}`);
  const earned = new Map((mine ?? []).map(row => [row.trophy_code as string, row.earned_at as string]));
  return (all ?? []).map(row => ({ ...(row as Omit<Trophy, 'earned_at'>), earned_at: earned.get(row.code as string) ?? null }));
}

/**
 * This week's cohort standing.
 *
 * Ranked on weekly XP rather than lifetime, which is what keeps the board worth
 * looking at: a player who joined on Monday can still win it, and a player who
 * banked ten thousand XP last year cannot sit at the top forever.
 */
export async function loadLeagueStanding(): Promise<LeagueStanding | null> {
  const userId = await currentUserId();

  const { data: membership, error: membershipError } = await supabase
    .from('league_members')
    .select('cohort_id,league_cohorts!inner(id,tier,season_id,league_seasons!inner(ends_on,closed_at))')
    .eq('user_id', userId)
    .is('league_cohorts.league_seasons.closed_at', null)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(`Could not load the leaderboard: ${membershipError.message}`);
  if (!membership) return null;

  const cohort = (Array.isArray(membership.league_cohorts) ? membership.league_cohorts[0] : membership.league_cohorts) as
    { id: string; tier: number; league_seasons: { ends_on: string } | { ends_on: string }[] };
  const season = Array.isArray(cohort.league_seasons) ? cohort.league_seasons[0] : cohort.league_seasons;

  const [{ data: tierRow }, rows] = await Promise.all([
    supabase.from('league_tiers').select('tier,name,promote_count,demote_count,promotion_gems').eq('tier', cohort.tier).single(),
    loadCohortRows(cohort.id, userId),
  ]);

  return {
    cohortId: cohort.id,
    tier: tierRow as LeagueTier,
    seasonEndsOn: season?.ends_on ?? '',
    rows,
  };
}

async function loadCohortRows(cohortId: string, meId: string): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase
    .from('league_members')
    .select('user_id,weekly_xp,player_profiles!inner(display_name,total_xp,is_premium)')
    .eq('cohort_id', cohortId)
    .order('weekly_xp', { ascending: false })
    .order('joined_at', { ascending: true });
  if (error) throw new Error(`Could not load the leaderboard: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>, index) => {
    const profile = (Array.isArray(row.player_profiles) ? row.player_profiles[0] : row.player_profiles) as
      { display_name: string; total_xp: number; is_premium: boolean };
    return {
      user_id: row.user_id as string,
      display_name: profile?.display_name?.trim() || 'Anonymous learner',
      weekly_xp: Number(row.weekly_xp ?? 0),
      level: levelForXp(profile?.total_xp ?? 0),
      is_premium: Boolean(profile?.is_premium),
      rank: index + 1,
      you: row.user_id === meId,
    };
  });
}

/**
 * Live updates while the board is on screen.
 *
 * Subscribes to this cohort's rows only. A player watching the leaderboard
 * should see somebody overtake them as it happens; polling would either lag by
 * the interval or hammer the database for a screen most people leave open.
 */
export function subscribeToCohort(cohortId: string, onChange: (rows: LeaderboardRow[]) => void) {
  let cancelled = false;
  let meId: string | undefined;
  // Coalesce a burst into one query. Every XP award in the cohort emits an
  // event, so thirty players finishing around the same time would otherwise
  // trigger thirty full thirty-row refetches in every connected browser.
  let pending: ReturnType<typeof setTimeout> | undefined;
  const channel = supabase
    .channel(`league:${cohortId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'league_members', filter: `cohort_id=eq.${cohortId}` },
      () => {
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => void (async () => {
          try {
            // Resolved once and cached, not per event: this fires every time
            // anyone in a cohort of thirty earns XP, and an auth round-trip on
            // each one is a lot of traffic for an id that cannot change while
            // the page is open.
            meId ??= await currentUserId();
            const rows = await loadCohortRows(cohortId, meId);
            if (!cancelled) onChange(rows);
          } catch { /* a dropped refresh is not worth surfacing mid-session */ }
        })(), 400);
      })
    .subscribe();
  return () => {
    cancelled = true;
    if (pending) clearTimeout(pending);
    void supabase.removeChannel(channel);
  };
}

/* ---------------------------------------------------------------- writes ---- */

/**
 * Bank a finished interview.
 *
 * The report id is the only input: the database reads the score off the stored
 * row and decides the award. Safe to call twice - the ledger's unique index on
 * (user_id, source, ref_id) turns a repeat into a no-op, which matters because
 * this is called from the same place a flaky connection gets retried.
 */
export async function awardInterviewXp(reportId: string): Promise<XpAward> {
  const { data, error } = await supabase.rpc('award_interview_xp', { p_report_id: reportId });
  if (error) throw new Error(`Could not record your XP: ${error.message}`);
  return (data ?? { xp: 0 }) as XpAward;
}

export async function touchDailyActivity(): Promise<{ streak_days: number; gems: number; gems_awarded: number }> {
  const { data, error } = await supabase.rpc('touch_daily_activity');
  if (error) throw new Error(`Could not update your streak: ${error.message}`);
  return data as { streak_days: number; gems: number; gems_awarded: number };
}

export type GemSpend = 'spend_retry' | 'spend_streak_freeze' | 'spend_premium_bank' | 'spend_report_deepdive';

/**
 * What each sink is called. The *price* is deliberately not here.
 *
 * It used to be, duplicated from public.gem_price() with nothing to catch the
 * two drifting apart - and since the database is what actually charges, a drift
 * would have shown players one number and taken another. `loadGemPrices()`
 * reads the authoritative figures.
 */
export const GEM_SINKS: Record<GemSpend, { label: string; blurb: string }> = {
  spend_retry: { label: 'Full-value retry', blurb: 'Retake an interview without the repeat penalty on XP.' },
  spend_streak_freeze: { label: 'Streak freeze', blurb: 'Protects your streak for one missed day.' },
  spend_premium_bank: { label: 'Premium question set', blurb: 'One session with the harder curated bank.' },
  spend_report_deepdive: { label: 'Deep-dive report', blurb: 'Full transcript analysis on one past interview.' },
};

/** The prices the database will actually charge, in one round-trip. */
export async function loadGemPrices(): Promise<Record<GemSpend, number>> {
  const { data, error } = await supabase.rpc('gem_prices');
  if (error) throw new Error(`Could not load gem prices: ${error.message}`);
  return (data ?? {}) as Record<GemSpend, number>;
}

export async function spendGems(source: GemSpend, ref?: string): Promise<{ ok: boolean; gems: number; reason?: string }> {
  // The price is not sent: public.gem_price() is what is charged. A client that
  // could name its own price could buy a 40-gem item for one.
  const { data, error } = await supabase.rpc('spend_gems', { p_source: source, p_ref: ref ?? null });
  if (error) throw new Error(`Could not spend gems: ${error.message}`);
  return data as { ok: boolean; gems: number; reason?: string };
}

/* --------------------------------------------------------------- premium ---- */

/**
 * What the two tiers actually differ on.
 *
 * The split is rate and depth, never the leaderboard itself. Letting premium
 * buy XP would make the board measure spending rather than practice, and the
 * board is the thing people come back for.
 */
export const PREMIUM_BENEFITS = [
  'Unlimited interviews a day (free: one)',
  'Gems earned at double rate',
  '150 bonus gems every month',
  'Full transcript and per-competency breakdown on every report',
  'The harder curated question sets, without spending gems',
] as const;


export function premiumIsActive(profile: PlayerProfile): boolean {
  if (!profile.is_premium) return false;
  if (!profile.premium_until) return true;
  return new Date(profile.premium_until).getTime() > Date.now();
}

/* ------------------------------------------------------- daily allowance ---- */

export interface DailyAllowance { premium: boolean; used: number; limit: number | null; allowed: boolean }

/**
 * Claim one of today's attempts before an interview begins.
 *
 * Called at the start rather than the end so a free player is told up front,
 * instead of sitting a full round and only then learning it earned nothing.
 * Re-entering the same `sessionRef` (a refresh, a reconnect) returns
 * `resumed: true` and costs nothing.
 */
export async function beginInterview(sessionRef: string): Promise<DailyAllowance & { started?: boolean; resumed?: boolean }> {
  const { data, error } = await supabase.rpc('begin_interview', { p_session_ref: sessionRef });
  if (error) throw new Error(`Could not start the interview: ${error.message}`);
  return data as DailyAllowance & { started?: boolean; resumed?: boolean };
}

/** Update the name other players see on the leaderboard. */
export async function updateDisplayName(name: string): Promise<string> {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) throw new Error('A display name cannot be empty.');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('You are signed out.');
  // upsert, not update. A player whose profile row does not exist yet - anyone
  // who has not triggered touch_daily_activity - would have had their name
  // "saved" against zero rows: no error, no change, and a UI saying "Saved."
  const { error: updateError } = await supabase
    .from('player_profiles')
    .upsert({ user_id: data.user.id, display_name: trimmed }, { onConflict: 'user_id' });
  if (updateError) throw new Error(`Could not save your name: ${updateError.message}`);
  return trimmed;
}

/** Billing is not wired yet; the UI says so rather than offering a dead button. */
export const BILLING_ENABLED = false;
