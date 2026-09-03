'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  loginHref,
  parseAccountRole,
  safePostAuthPath,
  type AccountRole,
} from '@/lib/authRoles';
import { supabase } from '@/lib/supabaseClient';

type Mode = 'signin' | 'signup' | 'magic';

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <RoleAwareLogin />
    </Suspense>
  );
}

function RoleAwareLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = parseAccountRole(searchParams.get('role'));
  const requestedNext = searchParams.get('next');
  const destination = safePostAuthPath(requestedNext, role);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Do not redirect merely because an old session already exists. Someone
    // who deliberately clicks "Sign in" must be allowed to see this page (and
    // potentially switch accounts). Only a fresh auth event, such as returning
    // from a magic link, should advance automatically.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) router.replace(destination);
    });
    return () => data.subscription.unsubscribe();
  }, [destination, router]);

  const switchRole = (nextRole: AccountRole) => {
    setError(null);
    setNotice(null);
    router.replace(loginHref(nextRole, safePostAuthPath(requestedNext, nextRole)));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === 'magic') {
        const returnTo = `${window.location.origin}${loginHref(role, destination)}`;
        const { error: authError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: returnTo,
            data: { account_role: role },
          },
        });
        if (authError) throw authError;
        setNotice(`Check your email for a secure ${role === 'individual' ? 'candidate' : 'employer'} sign-in link.`);
        return;
      }

      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { account_role: role },
            emailRedirectTo: `${window.location.origin}${loginHref(role, destination)}`,
          },
        });
        if (authError) throw authError;
        if (!data.session) {
          setNotice('Account created. Confirm your email, then return here to sign in.');
          return;
        }
        router.replace(destination);
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      router.replace(destination);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : String(authError));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.includes('@')) {
      setError('Enter your email address first.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${loginHref(role)}`,
      });
      if (authError) throw authError;
      setNotice('Password reset instructions are on their way.');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : String(authError));
    } finally {
      setBusy(false);
    }
  };

  const individual = role === 'individual';
  const roleLabel = individual ? 'candidate' : 'employer';
  const canSubmit = email.includes('@') && (mode === 'magic' || password.length >= 6) && !busy;

  return (
    <main className={`relative min-h-screen overflow-hidden px-4 py-10 sm:px-6 ${
      individual ? 'bg-[#f7f9fb]' : 'bg-[#f3f4f6]'
    }`}>
      <AmbientShape role={role} position="top" />
      <AmbientShape role={role} position="bottom" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-[440px]
                      flex-col justify-center">
        <div className="mb-8 text-center">
          <Link href="/" className={`text-3xl font-extrabold tracking-tight ${
            individual ? 'text-[var(--color-practice-deep)]' : 'font-serif text-black'
          }`}>
            {individual ? 'InterviewPro' : 'InterviewElite'}
          </Link>
          <p className="mt-2 text-sm text-slate-500">
            {individual ? 'Elevate your career trajectory.' : 'Build a fairer, sharper hiring process.'}
          </p>
        </div>

        <section className={`overflow-hidden border border-slate-200 bg-white
                             shadow-[0_20px_60px_rgba(15,23,42,0.12)] transition-all ${
          individual ? 'rounded-2xl' : 'rounded-md'
        }`}>
          <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50" role="tablist">
            <RoleTab
              active={individual}
              label="I'm a Candidate"
              onClick={() => switchRole('individual')}
              role="individual"
            />
            <RoleTab
              active={!individual}
              label="I'm an Employer"
              onClick={() => switchRole('enterprise')}
              role="enterprise"
            />
          </div>

          <div className="p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                {individual ? 'Individual workspace' : 'Enterprise console'}
              </p>
              <h1 className={`mt-2 text-2xl font-bold text-slate-950 ${!individual ? 'font-serif' : ''}`}>
                {mode === 'signup' ? `Create your ${roleLabel} account` : `Welcome back, ${roleLabel}`}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {mode === 'magic' ? 'We will email you a secure sign-in link.'
                  : individual ? 'Continue your practice journey and track your progress.'
                    : 'Manage interviews, candidates, and evaluation reports.'}
              </p>
            </div>

            <form className="space-y-4" onSubmit={submit}>
              <AuthField
                label="Email address"
                type="email"
                value={email}
                autoComplete="email"
                placeholder="you@example.com"
                onChange={setEmail}
              />

              {mode !== 'magic' && (
                <AuthField
                  label="Password"
                  type="password"
                  value={password}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="At least 6 characters"
                  onChange={setPassword}
                />
              )}

              {mode === 'signin' && (
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="text-slate-500">Secure sign-in with Supabase</span>
                  <button type="button" onClick={resetPassword}
                          className={`font-semibold hover:underline ${individual ? 'text-indigo-700' : 'text-black'}`}>
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className={`flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold
                            text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  individual
                    ? 'rounded-xl bg-[var(--color-practice-deep)] hover:bg-[var(--color-practice-accent)]'
                    : 'rounded-sm bg-black hover:bg-slate-800'
                }`}
              >
                {busy ? 'Working…' : mode === 'signup' ? 'Create account'
                  : mode === 'magic' ? 'Email me a sign-in link' : 'Sign in'}
                {!busy && <span aria-hidden="true">→</span>}
              </button>
            </form>

            {error && <AuthBanner tone="error">{error}</AuthBanner>}
            {notice && !error && <AuthBanner tone="notice">{notice}</AuthBanner>}

            <div className="mt-6 flex flex-col items-center gap-2 border-t border-slate-200 pt-6 text-sm">
              {mode !== 'signup' && (
                <ModeButton onClick={() => setMode('signup')} role={role}>
                  New here? Create an account
                </ModeButton>
              )}
              {mode !== 'signin' && (
                <ModeButton onClick={() => setMode('signin')} role={role}>
                  Sign in with a password
                </ModeButton>
              )}
              {mode !== 'magic' && (
                <ModeButton onClick={() => setMode('magic')} role={role}>
                  Use a magic link instead
                </ModeButton>
              )}
            </div>
          </div>
        </section>

        <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
          <Link href={individual ? '/individuals' : '/enterprise-landing'} className="hover:text-slate-900">
            ← Back to {individual ? 'individuals' : 'enterprise'}
          </Link>
          <span>Role-aware workspace</span>
        </div>
      </div>
    </main>
  );
}

function RoleTab({ active, label, onClick, role }: {
  active: boolean;
  label: string;
  onClick: () => void;
  role: AccountRole;
}) {
  const activeStyle = role === 'individual'
    ? 'border-indigo-600 text-indigo-700'
    : 'border-black text-black';
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`border-b-2 px-3 py-4 text-sm font-semibold transition hover:bg-slate-100 ${
        active ? activeStyle : 'border-transparent text-slate-500'
      }`}
    >
      {label}
    </button>
  );
}

function AuthField({ label, type, value, autoComplete, placeholder, onChange }: {
  label: string;
  type: 'email' | 'password';
  value: string;
  autoComplete: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3
                   font-normal text-slate-950 outline-none transition placeholder:text-slate-400
                   focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

function ModeButton({ children, onClick, role }: {
  children: React.ReactNode;
  onClick: () => void;
  role: AccountRole;
}) {
  return (
    <button type="button" onClick={onClick}
            className={`font-semibold hover:underline ${role === 'individual' ? 'text-indigo-700' : 'text-black'}`}>
      {children}
    </button>
  );
}

function AuthBanner({ children, tone }: {
  children: React.ReactNode;
  tone: 'error' | 'notice';
}) {
  return (
    <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
      tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
    }`}>
      {children}
    </div>
  );
}

function AmbientShape({ role, position }: { role: AccountRole; position: 'top' | 'bottom' }) {
  const placement = position === 'top'
    ? '-right-48 -top-48 h-[560px] w-[560px]'
    : '-bottom-60 -left-48 h-[440px] w-[440px]';
  const color = role === 'individual'
    ? position === 'top' ? 'bg-indigo-600/20' : 'bg-emerald-500/10'
    : position === 'top' ? 'bg-slate-900/10' : 'bg-blue-400/10';
  return (
    <div aria-hidden="true"
         className={`pointer-events-none absolute rounded-full blur-3xl transition-colors ${placement} ${color}`} />
  );
}

function AuthPageFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f9fb] text-sm text-slate-500">
      Preparing your workspace…
    </main>
  );
}
