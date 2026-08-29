'use client';

import dynamic from 'next/dynamic';

const InterviewRoomLive = dynamic(() => import('./InterviewRoomLive'), {
  ssr: false,
});

export default function InterviewRoomPage() {
  return <InterviewRoomLive />;
}
