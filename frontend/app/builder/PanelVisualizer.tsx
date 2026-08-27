import React from 'react';
import { GlassTile } from '@/components/ui/GlassTile';
import { Agent } from '@/store/builderStore';

interface PanelVisualizerProps {
  agents: Agent[];
  onClick: () => void;
}

export function PanelVisualizer({ agents, onClick }: PanelVisualizerProps) {
  return (
    <div style={{ padding: '16px', paddingBottom: 0 }}>
      <div 
        onClick={onClick}
        style={{ cursor: 'pointer', transition: 'transform 150ms ease, box-shadow 150ms ease' }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'none';
        }}
      >
        <GlassTile style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Panel Overview</span>
            <div style={{ display: 'flex', gap: '2px', height: '12px', alignItems: 'center' }}>
              {[8, 12, 6, 10].map((h, i) => (
                <div key={i} style={{ width: '2px', height: `${h}px`, backgroundColor: '#FFFFFF', opacity: 0.5, borderRadius: '1px' }} />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', minHeight: '60px', alignItems: 'center' }}>
            {agents.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', opacity: 0.5 }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px dashed #FFFFFF' }} />
                <span style={{ fontSize: '11px', color: '#FFFFFF' }}>No agents yet</span>
              </div>
            ) : (
              agents.map((agent) => (
                <div key={agent.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '50%', 
                    border: `2px solid ${agent.identity.color}`,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    position: 'relative'
                  }}>
                    {/* Abstract silhouette head/shoulders */}
                    <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '20px', height: '10px', backgroundColor: agent.identity.color, opacity: 0.2, borderTopLeftRadius: '10px', borderTopRightRadius: '10px' }} />
                    <div style={{ position: 'absolute', top: '6px', left: '50%', transform: 'translateX(-50%)', width: '10px', height: '10px', backgroundColor: agent.identity.color, opacity: 0.2, borderRadius: '50%' }} />
                  </div>
                  <span style={{ fontSize: '10px', color: '#FFFFFF', maxWidth: '60px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {agent.identity.role}
                  </span>
                </div>
              ))
            )}
          </div>
        </GlassTile>
      </div>
    </div>
  );
}
