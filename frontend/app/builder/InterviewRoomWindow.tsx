import React from 'react';
import { Agent } from '@/store/builderStore';
import { PanelTableGraphic } from './PanelTableGraphic';

interface InterviewRoomWindowProps {
  agents: Agent[];
  activeSpeakerId: string | 'user' | null;
  onClose: () => void;
  closeLabel?: string;
  title?: string;
}

export function InterviewRoomWindow({ 
  agents, 
  activeSpeakerId, 
  onClose, 
  closeLabel = 'Close',
  title = 'Interview Room'
}: InterviewRoomWindowProps) {
  return (
    <div style={{
      backgroundColor: '#000000',
      borderRadius: '16px',
      border: '1px solid var(--border-strong)',
      boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      width: '90vw',
      maxWidth: '1200px',
      height: '85vh',
      maxHeight: '800px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '24px 32px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h2 className="text-display" style={{ fontSize: '24px', margin: 0, color: '#FFF' }}>{title}</h2>
        <button 
          onClick={onClose}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            backgroundColor: 'transparent',
            color: '#FFF',
            cursor: 'pointer',
            fontWeight: 500,
            transition: 'background-color 150ms ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {closeLabel}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PanelTableGraphic agents={agents} activeSpeakerId={activeSpeakerId} scale={1} />
      </div>
    </div>
  );
}
