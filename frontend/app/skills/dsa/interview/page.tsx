'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const DsaInterviewRoom = dynamic(
  () => import('@/components/dsa-interview/DsaInterviewRoom').then((module) => module.DsaInterviewRoom),
  { ssr: false },
);

export default function DsaInterviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070a10]" />}>
      <DsaInterviewRoom />
    </Suspense>
  );
}
