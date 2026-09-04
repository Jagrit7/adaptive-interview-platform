'use client';

import React, { useState } from 'react';
import { generateCandidateRef } from '@/lib/reports';

/**
 * Shown before the interview starts, so the report has a name attached to it.
 *
 * The reference code is generated here rather than on the backend and shown to
 * the candidate before they begin. That ordering matters: if the backend
 * restarts mid-interview the session is lost, and a candidate who already wrote
 * their code down can still be matched to whatever was saved.
 *
 * `fixedName` is set for an invited candidate, whose name comes from the
 * invitation the recruiter created. It is shown read-only rather than hidden,
 * so somebody who was sent the wrong invitation notices before they start - but
 * it is not editable, because a name typed here would not match the person the
 * interview was authorised for. The backend ignores it either way.
 */
export function CandidateForm({
  panelName,
  agentCount,
  fixedName,
  onStart,
  onCancel,
}: {
  panelName: string;
  agentCount: number;
  fixedName?: string;
  onStart: (candidate: { name: string; ref: string }) => void;
  onCancel: () => void;
}) {
  const invited = Boolean(fixedName?.trim());
  const [name, setName] = useState(fixedName?.trim() ?? '');
  const [ref, setRef] = useState(() => generateCandidateRef());
  const canStart = invited || name.trim().length >= 2;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '440px', padding: '32px',
        border: '1px solid var(--border)', borderRadius: '12px',
        backgroundColor: 'var(--surface)',
      }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
          Before we start
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 24px' }}>
          {panelName || 'Untitled panel'} &middot; {agentCount} interviewer{agentCount === 1 ? '' : 's'}
        </p>

        <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Candidate name</label>
        <input
          value={name}
          autoFocus={!invited}
          readOnly={invited}
          autoComplete="name"
          onChange={(e) => { if (!invited) setName(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && canStart) onStart({ name: name.trim(), ref }); }}
          placeholder="e.g. Priya Sharma"
          style={{
            width: '100%', padding: '10px 12px', margin: '6px 0 20px',
            backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px',
          }}
        />

        <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Reference code</label>
        <div style={{ display: 'flex', gap: '8px', margin: '6px 0 8px' }}>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value.toUpperCase())}
            style={{
              flex: 1, padding: '10px 12px', backgroundColor: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text-primary)', fontSize: '14px',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.05em',
            }}
          />
          <button
            onClick={() => setRef(generateCandidateRef())}
            title="Generate a new code"
            style={{
              padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-secondary)', fontSize: '13px',
            }}
          >
            New
          </button>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
          Identifies this sitting, not the person &mdash; a second attempt gets its own code.
          Note it down: it is how you find this report later.
        </p>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => onStart({ name: name.trim(), ref })}
            disabled={!canStart}
            style={{
              flex: 1, padding: '11px', borderRadius: '8px', border: 'none',
              fontWeight: 500, fontSize: '14px',
              cursor: canStart ? 'pointer' : 'not-allowed',
              backgroundColor: canStart ? 'var(--text-primary)' : 'var(--border-strong)',
              color: canStart ? 'var(--bg)' : 'var(--text-muted)',
            }}
          >
            Start interview
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '11px 16px', borderRadius: '8px', cursor: 'pointer',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-secondary)', fontSize: '14px',
            }}
          >
            Back
          </button>
        </div>

        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '18px', lineHeight: 1.5 }}>
          This interview is conducted by AI. A transcript and score breakdown are saved to your
          account when it ends.
        </p>
      </div>
    </div>
  );
}
