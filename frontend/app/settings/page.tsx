'use client';

import { useState } from 'react';
import { PracticeShell } from '@/components/practice/PracticeShell';
import { PROFILE, USER } from '@/lib/mockData';

const TABS = ['Profile', 'Notifications', 'Practice', 'Account'] as const;
type Tab = typeof TABS[number];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('Profile');

  return (
    <PracticeShell user={USER}>
      <h1 className="text-4xl font-extrabold tracking-tight mb-2">Settings</h1>
      <p className="text-[var(--color-practice-ink-soft)] mb-8">
        Your profile, what you get told about, and how interviews run.
      </p>

      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav className="flex lg:flex-col gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} aria-current={tab === t}
                    className={`px-4 py-2.5 rounded-[var(--radius-control)] text-sm text-left
                                whitespace-nowrap transition ${
              tab === t
                ? 'bg-[var(--color-practice-accent)] text-white font-semibold'
                : 'text-[var(--color-practice-ink-soft)] hover:bg-[var(--color-practice-sunken)]'
            }`}>
              {t}
            </button>
          ))}
        </nav>

        <div className="space-y-5">
          {tab === 'Profile' && (
            <Panel title="Profile">
              <Field label="Display name" defaultValue={PROFILE.name} />
              <Field label="Headline" defaultValue={PROFILE.title} />
              <Field label="Target role" defaultValue={PROFILE.goal} />
              <Field label="Email" defaultValue="alex@example.com" type="email" />
              <Save />
            </Panel>
          )}

          {tab === 'Notifications' && (
            <Panel title="Notifications">
              <Toggle label="Streak reminders"
                      hint="A nudge if your streak is about to lapse." initial />
              <Toggle label="Report ready"
                      hint="When an interview has been scored." initial />
              <Toggle label="League movement"
                      hint="Promotion, relegation, and rank changes." initial />
              <Toggle label="Product updates"
                      hint="New skill paths and features." />
              <Save />
            </Panel>
          )}

          {tab === 'Practice' && (
            <Panel title="Practice defaults">
              <Select label="Default interview mode" options={['Practice', 'Exam']} />
              <Select label="Default interviewer manner"
                      options={['Supportive and guiding', 'Balanced', 'Strict and challenging']} />
              <Select label="Interview language"
                      options={['English (US)', 'English (India)', 'Hindi', 'Spanish', 'Japanese']} />
              <Toggle label="Camera on by default"
                      hint="Self view only. Nothing is sent to the panel or recorded." />
              <Save />
            </Panel>
          )}

          {tab === 'Account' && (
            <>
              <Panel title="Plan">
                <div className="flex items-center justify-between gap-4 p-4 rounded-[var(--radius-card)]
                                bg-[var(--color-practice-sunken)]">
                  <div>
                    <div className="font-bold">Free</div>
                    <div className="text-sm text-[var(--color-practice-ink-soft)]">
                      Three interviews a week, all skill paths.
                    </div>
                  </div>
                  <button className="px-5 py-2.5 rounded-full font-semibold text-sm text-white
                                     bg-[var(--color-practice-deep)]">
                    Upgrade to Pro
                  </button>
                </div>
              </Panel>

              <Panel title="Danger zone" danger>
                <p className="text-sm text-[var(--color-practice-ink-soft)] mb-4">
                  Deleting your account removes every interview report and your entire
                  history. This cannot be undone.
                </p>
                <button className="px-5 py-2.5 rounded-[var(--radius-control)] text-sm font-semibold
                                   border border-[var(--color-practice-hard)]
                                   text-[var(--color-practice-hard)]
                                   hover:bg-[color-mix(in_srgb,var(--color-practice-hard)_8%,white)]
                                   transition">
                  Delete account
                </button>
              </Panel>
            </>
          )}
        </div>
      </div>
    </PracticeShell>
  );
}

function Panel({ title, children, danger }:
  { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className={`rounded-[var(--radius-panel)] p-7 border ${
      danger
        ? 'border-[var(--color-practice-hard)] bg-[var(--color-practice-surface)]'
        : 'border-[var(--color-practice-border)] bg-[var(--color-practice-surface)]'
    }`}>
      <h2 className={`text-xl font-extrabold mb-5 ${
        danger ? 'text-[var(--color-practice-hard)]' : ''}`}>{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({ label, defaultValue, type = 'text' }:
  { label: string; defaultValue: string; type?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold mb-2">{label}</span>
      <input type={type} defaultValue={defaultValue}
             className="w-full px-4 py-3 rounded-[var(--radius-control)] text-sm
                        bg-[var(--color-practice-bg)]
                        border border-[var(--color-practice-border)]" />
    </label>
  );
}

function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold mb-2">{label}</span>
      <select className="w-full px-4 py-3 rounded-[var(--radius-control)] text-sm
                         bg-[var(--color-practice-bg)]
                         border border-[var(--color-practice-border)]">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, hint, initial }:
  { label: string; hint: string; initial?: boolean }) {
  const [on, setOn] = useState(!!initial);
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <div className="font-semibold text-sm">{label}</div>
        <div className="text-xs text-[var(--color-practice-ink-mute)]">{hint}</div>
      </div>
      <button role="switch" aria-checked={on} aria-label={label}
              onClick={() => setOn((v) => !v)}
              className={`w-12 h-7 rounded-full relative shrink-0 transition ${
        on ? 'bg-[var(--color-practice-accent)]' : 'bg-[var(--color-practice-border)]'}`}>
        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
          on ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}

function Save() {
  return (
    <button className="px-6 py-3 rounded-[var(--radius-control)] font-semibold text-white
                       bg-[var(--color-practice-accent)] hover:brightness-110 transition">
      Save changes
    </button>
  );
}
