'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  levelForXp, loadProfile, touchDailyActivity,
  type PlayerProfile,
} from '@/lib/gamification';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import type { PracticeUser } from '@/components/practice/PracticeShell';

const EMPTY: PlayerProfile = {
  user_id: '', display_name: '', total_xp: 0, gems: 0, streak_days: 0,
  longest_streak: 0, last_active_on: null, is_premium: false, premium_until: null,
};

/**
 * The signed-in player's live progression state.
 *
 * `touchDaily` records the streak and pays the once-a-day gem, so it fires on
 * the first practice screen of a session rather than on every page: the day's
 * gem is idempotent server-side, but a write per navigation is noise.
 *
 * Failure is deliberately soft. A signed-out visitor, or a browser with no
 * Supabase configured, gets a zeroed profile and a working page instead of an
 * error screen - the progression system is an overlay on the product, not a
 * gate in front of it.
 */
export function usePlayer({ touchDaily = false }: { touchDaily?: boolean } = {}) {
  const [profile, setProfile] = useState<PlayerProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  const refresh = useCallback(async () => {
    const next = await loadProfile();
    setProfile(next);
    setSignedIn(Boolean(next.user_id));
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isSupabaseConfigured()) { if (active) setLoading(false); return; }
      try {
        if (touchDaily) await touchDailyActivity();
        const next = await loadProfile();
        if (!active) return;
        setProfile(next);
        setSignedIn(Boolean(next.user_id));
      } catch {
        // Signed out, or the tables are not installed yet. Neither should stop
        // the page rendering.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [touchDaily]);

  const user: PracticeUser = {
    name: profile.display_name?.trim() || 'You',
    track: profile.is_premium ? 'Premium member' : 'Free plan',
    level: levelForXp(profile.total_xp),
    xp: profile.total_xp,
    streak: profile.streak_days,
    gems: profile.gems,
  };

  return { profile, user, loading, signedIn, refresh };
}
