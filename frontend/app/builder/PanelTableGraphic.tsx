import React from 'react';
import { Agent } from '@/store/builderStore';
import { Waveform } from '@/components/ui/Waveform';
import { AgentDetailModal } from '@/components/ui/AgentDetailModal';

interface PanelTableGraphicProps {
  agents: Agent[];
  activeSpeakerId: string | 'user' | null;
  scale?: number;
}

export function PanelTableGraphic({ agents, activeSpeakerId, scale = 1 }: PanelTableGraphicProps) {
  const [selectedAgent, setSelectedAgent] = React.useState<Agent | null>(null);

  // Base dimensions at scale 1
  const width = 600;
  const height = 400;
  
  // The oval (table) dimensions
  const tableWidth = 400;
  const tableHeight = 200;
  
  // Center of the container
  const cx = width / 2;
  const cy = height / 2;

  // Render a circle for an agent or placeholder
  const renderCircle = (
    key: string,
    x: number, 
    y: number, 
    isInterviewee: boolean,
    isPlaceholder: boolean,
    agent?: Agent
  ) => {
    const isSpeaking = isInterviewee 
      ? activeSpeakerId === 'user' 
      : (agent && activeSpeakerId === agent.id);
      
    const color = isInterviewee 
      ? 'var(--accent-slate)' 
      : isPlaceholder 
        ? 'var(--text-muted)' 
        : agent?.identity.color || 'var(--text-primary)';

    const labelText = isInterviewee 
      ? 'Candidate'
      : isPlaceholder
        ? ''
        : `${agent?.identity.name.split(' ')[0]} (${agent?.identity.role})`;

    return (
      <div 
        key={key}
        onClick={() => agent && !isPlaceholder && setSelectedAgent(agent)}
        style={{
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          cursor: (agent && !isPlaceholder) ? 'pointer' : 'default'
        }}
      >
        <div style={{
          position: 'relative',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          border: isPlaceholder ? `2px dashed ${color}` : `2px solid ${color}`,
          backgroundColor: isPlaceholder ? 'transparent' : 'rgba(255, 255, 255, 0.05)',
          boxShadow: isSpeaking && !isPlaceholder ? `0 0 15px 2px ${color}` : 'none',
          transition: 'box-shadow 300ms ease, transform 150ms ease'
        }}>
          {!isPlaceholder && (
            <>
              {/* Abstract silhouette */}
              <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '32px', height: '16px', backgroundColor: color, opacity: 0.2, borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }} />
              <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', width: '16px', height: '16px', backgroundColor: color, opacity: 0.2, borderRadius: '50%' }} />
            </>
          )}
        </div>
        
        {labelText && (
          <div style={{
            fontSize: '14px',
            color: isInterviewee ? 'var(--text-secondary)' : 'var(--text-primary)',
            fontWeight: isInterviewee ? 400 : 500,
            whiteSpace: 'nowrap',
            textShadow: '0 2px 4px rgba(0,0,0,0.5)'
          }}>
            {labelText}
          </div>
        )}

        {/* Waveform below the label */}
        {!isPlaceholder && (
          <div style={{ marginTop: '-4px' }}>
            <Waveform variant={isSpeaking ? 'active' : 'idle'} color={color} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ 
      width: `${width * scale}px`, 
      height: `${height * scale}px`, 
      position: 'relative',
      transform: `scale(${scale})`,
      transformOrigin: 'top left'
    }}>
      {/* Table Outline */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: `${tableWidth}px`,
        height: `${tableHeight}px`,
        borderRadius: '50%',
        border: '2px solid rgba(255, 255, 255, 0.15)',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.2)'
      }} />

      {/* Interviewee (always at bottom center of table edge) */}
      {renderCircle('interviewee', cx, cy + tableHeight / 2, true, false)}

      {/* Interviewers along the top arc */}
      {agents.length === 0 ? (
        // Zero-agent state: 3 placeholders
        [1, 2, 3].map((_, i) => {
          const angleDeg = 180 - (180 / 4) * (i + 1); // 135, 90, 45 degrees
          const angleRad = (angleDeg * Math.PI) / 180;
          const x = cx + Math.cos(angleRad) * (tableWidth / 2);
          const y = cy - Math.sin(angleRad) * (tableHeight / 2);
          return renderCircle(`placeholder-${i}`, x, y, false, true);
        })
      ) : (
        agents.map((agent, i) => {
          // If only 1 agent, place at 90 degrees (top center).
          // If N > 1, distribute from 160 deg to 20 deg for a slight padding from the left/right edges
          let angleDeg = 90;
          if (agents.length > 1) {
            const startAngle = 160;
            const endAngle = 20;
            const step = (startAngle - endAngle) / (agents.length - 1);
            angleDeg = startAngle - (step * i);
          }
          const angleRad = (angleDeg * Math.PI) / 180;
          const x = cx + Math.cos(angleRad) * (tableWidth / 2);
          const y = cy - Math.sin(angleRad) * (tableHeight / 2);
          
          return renderCircle(`agent-${agent.id}`, x, y, false, false, agent);
        })
      )}

      {selectedAgent && (
        <AgentDetailModal 
          agent={selectedAgent} 
          onClose={() => setSelectedAgent(null)} 
        />
      )}
    </div>
  );
}
