'use client';

import React, { useState } from 'react';
import { useBuilderStore, RoleType } from '@/store/builderStore';
import { Button } from '@/components/ui/Button';
import { PanelVisualizer } from './PanelVisualizer';
import { PanelReadOnlyView } from './PanelReadOnlyView';

export function LeftRail() {
  const { agents, selectedAgentId, selectAgent, addAgent } = useBuilderStore();
  const [isVisualizerOpen, setIsVisualizerOpen] = useState(false);

  return (
    <>
      <div 
        style={{ 
          width: '280px', 
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--surface)'
        }}
      >
        <div style={{ flex: '0 0 auto' }}>
          <PanelVisualizer agents={agents} onClick={() => setIsVisualizerOpen(true)} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => selectAgent(agent.id)}
              style={{
                padding: '12px 24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: selectedAgentId === agent.id ? 'var(--surface-raised)' : 'transparent',
                borderLeft: selectedAgentId === agent.id ? `4px solid ${agent.identity.color}` : '4px solid transparent',
                transition: 'background-color 150ms ease'
              }}
            >
              <div 
                style={{ 
                  width: '12px', 
                  height: '12px', 
                  borderRadius: '50%', 
                  backgroundColor: agent.identity.color 
                }} 
              />
              <div className="flex flex-col">
                <span className="text-body" style={{ color: 'var(--text-primary)', fontWeight: selectedAgentId === agent.id ? 500 : 400 }}>
                  {agent.identity.name}
                </span>
                <span className="text-caption">{agent.identity.role}</span>
              </div>
            </div>
          ))}

          {agents.length > 0 && (
            <div style={{ margin: '16px 24px', borderTop: '1px solid var(--border)' }} />
          )}

          <div
            onClick={() => selectAgent('scorer')}
            style={{
              padding: '12px 24px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: selectedAgentId === 'scorer' ? 'var(--surface-raised)' : 'transparent',
              borderLeft: selectedAgentId === 'scorer' ? '4px solid var(--accent-slate)' : '4px solid transparent',
              transition: 'background-color 150ms ease'
            }}
          >
            <div 
              style={{ 
                width: '12px', 
                height: '12px', 
                borderRadius: '50%', 
                backgroundColor: 'var(--accent-slate)' 
              }} 
            />
            <span className="text-body" style={{ color: 'var(--text-primary)', fontWeight: selectedAgentId === 'scorer' ? 500 : 400 }}>
              Scorer Settings
            </span>
          </div>
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid var(--border)', position: 'relative' }}>
          <Button 
            variant="secondary" 
            className="w-full" 
            onClick={() => addAgent('Custom')}
          >
            + Add agent
          </Button>
        </div>
      </div>

      {isVisualizerOpen && <PanelReadOnlyView onClose={() => setIsVisualizerOpen(false)} />}
    </>
  );
}
