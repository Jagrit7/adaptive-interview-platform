'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { PublishedPanelView } from './InterviewRoomLive';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

const InterviewRoomLive = dynamic(() => import('./InterviewRoomLive'), {
  ssr: false,
});

export default function InterviewRoomPage() {
  return <Suspense fallback={<LoadingInterview />}><InterviewRoomLoader /></Suspense>;
}

function LoadingInterview() {
  return <div className="grid min-h-screen place-items-center bg-[#0f131d] text-sm text-[#aeb5c7]">Loading published interview…</div>;
}

function InterviewRoomLoader() {
  const params = useSearchParams();
  const panelId = params.get('panel');
  const invite = params.get('invite');
  const [panel, setPanel] = useState<PublishedPanelView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!panelId || !invite) return;
    fetch(`${BACKEND_URL}/published-panels/${encodeURIComponent(panelId)}?invite=${encodeURIComponent(invite)}`)
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'This interview invitation could not be loaded.');
        setPanel(data as PublishedPanelView);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, [invite, panelId]);

  if (!panelId || !invite) return <InterviewRoomLive />;
  if (loading) return <LoadingInterview />;
  if (error) return <div className="grid min-h-screen place-items-center bg-[#f7f8fa] p-8 text-center"><div><h1 className="font-serif text-3xl font-bold">Interview unavailable</h1><p className="mt-3 max-w-md text-sm text-[#676c74]">{error}</p><Link href="/" className="mt-6 inline-flex rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white">Return home</Link></div></div>;
  if (panel) return <InterviewRoomLive publishedPanel={panel} publishedAccess={{ panelId, invite }} exitHref="/" />;
  return null;
}
