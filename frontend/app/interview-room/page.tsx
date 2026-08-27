'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useBuilderStore } from '@/store/builderStore';
import { InterviewRoomWindow } from '@/app/builder/InterviewRoomWindow';

export default function InterviewRoomPage() {
  const router = useRouter();
  const { agents, activeSpeakerId } = useBuilderStore();

  return (
    <div 
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
      }}
    >
      <InterviewRoomWindow 
        agents={agents} 
        activeSpeakerId={activeSpeakerId} 
        onClose={() => router.push('/builder')} 
        closeLabel="Exit"
        title="Live Interview Room"
      />
    </div>
  );
}
