import React from 'react';
import { useBuilderStore } from '@/store/builderStore';
import { InterviewRoomWindow } from './InterviewRoomWindow';

export function InterviewRoomScene({ onClose }: { onClose: () => void }) {
  const { agents, activeSpeakerId } = useBuilderStore();

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <InterviewRoomWindow 
        agents={agents} 
        activeSpeakerId={activeSpeakerId} 
        onClose={onClose} 
      />
    </div>
  );
}
