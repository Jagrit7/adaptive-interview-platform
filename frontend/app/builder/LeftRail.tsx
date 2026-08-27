'use client';

import React, { useState } from 'react';
import { useBuilderStore, RoleType } from '@/store/builderStore';
import { Button } from '@/components/ui/Button';

export function LeftRail() {
  const { agents, selectedAgentId, selectAgent, addAgent } = useBuilderStore();
  const [showRolePicker, setShowRolePicker] = useState(false);

  const handleAddAgent = (role: RoleType) => {
    addAgent(role);
    setShowRolePicker(false);
  };

  return (
    <div 
      style={{ 
        width: '280px', 
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--surface)'
      }}
    >
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
        {showRolePicker ? (
          <div style={{ 
            position: 'absolute', 
            bottom: '64px', 
            left: '16px', 
            right: '16px',
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border-strong)',
            borderRadius: '8px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            zIndex: 10
          }}>
            <span className="text-caption" style={{ padding: '4px 8px' }}>Select archetype:</span>
            {(['Technical', 'Hiring manager', 'Product', 'Customer', 'Behavioural', 'Custom'] as RoleType[]).map(r => (
              <button 
                key={r}
                onClick={() => handleAddAgent(r)}
                style={{ 
                  textAlign: 'left', 
                  padding: '8px', 
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--border)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {r}
              </button>
            ))}
            <button 
              onClick={() => setShowRolePicker(false)}
              style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary)', cursor: 'pointer', backgroundColor: 'transparent' }}
            >
              Cancel
            </button>
          </div>
        ) : null}

        <Button 
          variant="secondary" 
          className="w-full" 
          onClick={() => setShowRolePicker(true)}
        >
          + Add agent
        </Button>
      </div>
    </div>
  );
}
