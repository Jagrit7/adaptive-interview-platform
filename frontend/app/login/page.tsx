'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Mode = 'signin' | 'signup' | 'magic';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Already signed in? Skip the form.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/panels');
    });
  }, [router]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/panels` },
        });
        if (error) throw error;
        setNotice('Check your email for a sign-in link.');
        return;
      }

      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // With "Confirm email" ON, signUp returns a user but no session, and
        // nothing appears to happen. Say so rather than silently doing nothing.
        if (!data.session) {
          setNotice(
            'Account created. Check your email to confirm it, then sign in. ' +
            '(To skip this during development, turn off "Confirm email" in ' +
            'Supabase → Authentication → Providers → Email.)'
          );
          return;
        }
        router.replace('/panels');
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace('/panels');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    email.includes('@') && (mode === 'magic' || password.length >= 6) && !busy;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px', backgroundColor: 'var(--bg)',
    }}>
      <div style={{
        width: '100%', maxWidth: '380px', padding: '32px',
        border: '1px solid var(--border)', borderRadius: '12px',
        backgroundColor: 'var(--surface)',
      }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
          {mode === 'signup' ? 'Create an account' : 'Sign in'}
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 24px' }}>
          Panels are saved to your account.
        </p>

        <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Email</label>
        <input
          type="email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(); }}
          style={inputStyle}
        />

        {mode !== 'magic' && (
          <>
            <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Password</label>
            <input
              type="password"
              value={password}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(); }}
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '-8px 0 16px' }}>
              At least 6 characters.
            </p>
          </>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
            fontWeight: 500, fontSize: '14px',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            backgroundColor: canSubmit ? 'var(--text-primary)' : 'var(--border-strong)',
            color: canSubmit ? 'var(--bg)' : 'var(--text-muted)',
          }}
        >
          {busy ? 'Working...' : mode === 'signup' ? 'Create account'
            : mode === 'magic' ? 'Email me a link' : 'Sign in'}
        </button>

        {error && <Banner tone="error">{error}</Banner>}
        {notice && !error && <Banner tone="notice">{notice}</Banner>}

        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {mode !== 'signup' && <Link onClick={() => setMode('signup')}>Create an account instead</Link>}
          {mode !== 'signin' && <Link onClick={() => setMode('signin')}>Sign in with a password</Link>}
          {mode !== 'magic' && <Link onClick={() => setMode('magic')}>Email me a sign-in link instead</Link>}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', margin: '6px 0 16px',
  backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px',
};

function Banner({ tone, children }: { tone: 'error' | 'notice'; children: React.ReactNode }) {
  const color = tone === 'error' ? 'var(--accent-rose)' : 'var(--text-secondary)';
  return (
    <div style={{
      marginTop: '16px', padding: '10px 12px', borderRadius: '8px',
      fontSize: '12px', lineHeight: 1.5, color,
      border: `1px solid ${tone === 'error' ? 'var(--accent-rose)' : 'var(--border)'}`,
    }}>
      {children}
    </div>
  );
}

function Link({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'left',
      }}
    >
      {children}
    </button>
  );
}
