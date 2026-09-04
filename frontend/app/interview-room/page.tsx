'use client';

import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { InvitationGate } from './InvitationGate';
import type { InvitationPanelView } from '@/lib/invitations';
import type { PublishedPanelView } from './InterviewRoomLive';

const InterviewRoomLive = dynamic(() => import('./InterviewRoomLive'), {
  ssr: false,
});

export default function InterviewRoomPage() {
  return <Suspense fallback={<LoadingInterview />}><InterviewRoomLoader /></Suspense>;
}

function LoadingInterview() {
  return <div className="grid min-h-screen place-items-center bg-[#0f131d] text-sm text-[#aeb5c7]">Loading interview…</div>;
}

/**
 * Entry point for an invited candidate.
 *
 * `?invite=<token>` is now a per-candidate credential rather than a shared
 * panel code, so the panel id is no longer in the URL - the token resolves to
 * one candidate on one interview, and the backend derives the rest. Older links
 * of the form `?panel=<id>&invite=<8 chars>` no longer work by design; those
 * codes authorised anyone who had them.
 */
function InterviewRoomLoader() {
  const params = useSearchParams();
  const token = params.get('invite');
  const legacyPanel = params.get('panel');
  const [access, setAccess] = useState<{ panel: InvitationPanelView; email: string } | null>(null);

  // No token at all: this is the builder's own preview of the locally stored
  // panel, which is unauthenticated on purpose and never leaves the machine.
  if (!token) {
    if (legacyPanel) return <RetiredLink />;
    return <InterviewRoomLive />;
  }

  if (!access) {
    return <InvitationGate token={token} onVerified={(panel, email) => setAccess({ panel, email })} />;
  }

  const panelView: PublishedPanelView = {
    projectName: access.panel.panel_name,
    language: access.panel.language,
    role: access.panel.role,
    // The gate returns only identity and turn-taking, which is all the room
    // renders. Prompts and scoring stay on the server.
    agents: access.panel.agents as PublishedPanelView['agents'],
  };

  return (
    <InterviewRoomLive
      publishedPanel={panelView}
      invitationAccess={{ token, email: access.email, candidateName: access.panel.candidate_name }}
      exitHref="/"
    />
  );
}

function RetiredLink() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f7f8fa] p-8 text-center">
      <div>
        <h1 className="font-serif text-3xl font-bold">This interview link is no longer valid</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#676c74]">
          Interviews are now sent to each candidate individually. Ask the hiring team to
          re-send your invitation and you will get a link of your own.
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white">
          Return home
        </Link>
      </div>
    </div>
  );
}
