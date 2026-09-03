'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { loginHref, type AccountRole } from '@/lib/authRoles';

/**
 * Redirects to /login when there is no session, and keeps that decision live via
 * onAuthStateChange so a session expiring mid-edit bounces the user out rather
 * than leaving them typing into a form whose saves will all fail.
 *
 * This is a UX guard, not a security boundary. Anyone can bypass a client-side
 * redirect. What actually protects data is the RLS policies in
 * supabase/schema.sql - if those are wrong, this component does nothing to help.
 */
export function AuthGate({
  children,
  role = 'enterprise',
}: {
  children: React.ReactNode;
  role?: AccountRole;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState(data.session ? 'in' : 'out');
      if (!data.session) router.replace(loginHref(role, pathname));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState(session ? 'in' : 'out');
      if (!session) router.replace(loginHref(role, pathname));
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [pathname, role, router]);

  if (state === 'checking') {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: 'var(--text-muted)', fontSize: '14px',
      }}>
        Checking your session...
      </div>
    );
  }

  // 'out' renders nothing; the redirect is already in flight.
  return state === 'in' ? <>{children}</> : null;
}

/** Small sign-out control for page headers. */
export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        router.replace('/login');
      }}
      style={{
        padding: '6px 12px', borderRadius: '6px', fontSize: '13px',
        border: '1px solid var(--border)', backgroundColor: 'transparent',
        color: 'var(--text-secondary)', cursor: 'pointer',
      }}
    >
      Sign out
    </button>
  );
}
