'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AuthGate } from '@/components/ui/AuthGate';
import type { PanelConfig } from '@/lib/panels';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

const InterviewRoomLive = dynamic(() => import('@/app/interview-room/InterviewRoomLive'), { ssr: false });

/**
 * Runs a prebuilt job panel on the enterprise interview pipeline.
 *
 * There is a second, purpose-built runtime for job panels on the backend
 * (/job-panels/sessions/*), but nothing on the frontend ever drove it - which is
 * why the SDE card was a dead card. Rather than build a third interview room to
 * speak that protocol, this reuses the one that already works.
 *
 * That is possible because a preset's `panel` field is a complete Panel: the
 * same shape the builder saves and /sessions/start already accepts. It has an
 * opener, three interviewers wired to the shared DSA, system-design and
 * behavioural banks, and per-agent scoring weights. So the LLM host, the
 * round-robin rotation, the coding workspace, the scorer and the report all
 * come for free, and there is one interview runtime to maintain rather than two.
 */
export default function JobPanelRunPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <AuthGate role="individual">
      <JobPanelLoader slug={slug} />
    </AuthGate>
  );
}

function JobPanelLoader({ slug }: { slug: string }) {
  const [panel, setPanel] = useState<PanelConfig | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/job-panels/${encodeURIComponent(slug)}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.detail === 'string' ? data.detail : 'That panel could not be loaded.');
        }
        if (!active) return;
        setTitle(data.title ?? '');
        setPanel(data.panel as PanelConfig);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      }
    })();
    return () => { active = false; };
  }, [slug]);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0f131d] p-8 text-center">
        <div>
          <h1 className="font-serif text-3xl font-bold text-[#eef4fb]">This panel could not start</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#aeb5c7]">{error}</p>
          <Link href="/job-panels" className="mt-6 inline-flex rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#0f131d]">
            Back to job interviews
          </Link>
        </div>
      </div>
    );
  }

  if (!panel) {
    return <div className="grid min-h-screen place-items-center bg-[#0f131d] text-sm text-[#aeb5c7]">Preparing your {title || 'panel'} interview…</div>;
  }

  // No invitationAccess and no testMode: this is the signed-in individual
  // practising, so it consumes a daily attempt and banks XP like any other
  // practice round.
  return <InterviewRoomLive panelOverride={panel} exitHref="/job-panels" />;
}
