import React from 'react';
import { Agent, useBuilderStore } from '@/store/builderStore';

interface AgentDetailModalProps {
  agent: Agent;
  onClose: () => void;
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string, value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '15px', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        {value === '' ? <span style={{ opacity: 0.5 }}>—</span> : value}
      </div>
    </div>
  );
}

export function AgentDetailModal({ agent, onClose }: AgentDetailModalProps) {
  const language = useBuilderStore((s) => s.language);

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: '#000000',
          borderRadius: '16px',
          border: '1px solid var(--border-strong)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
          width: '100%',
          maxWidth: '800px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '24px 32px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: agent.identity.color }} />
            <h2 className="text-display" style={{ fontSize: '24px', margin: 0, color: agent.identity.color }}>
              {agent.identity.name} <span style={{ opacity: 0.7, fontSize: '18px' }}>({agent.identity.role})</span>
            </h2>
          </div>
          <button 
            onClick={onClose}
            style={{
              width: '32px', height: '32px',
              borderRadius: '50%',
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: '#FFF',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px'
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '32px', overflowY: 'auto', flex: 1, backgroundColor: '#000000' }}>
          <div style={{ columnCount: 2, columnGap: '48px' }}>
            <div style={{ breakInside: 'avoid' }}>
              <Section title="Voice & Personality">
                <Field label="Language" value={language} />
                <Field label="System Prompt" value={agent.behavior.systemPrompt} />
                {agent.turnTaking.canOpen && (
                  <Field label="Greeting Message" value={agent.behavior.greetingMessage} />
                )}
                <Field label="Fallback Message" value={agent.behavior.fallbackMessage} />
                {agent.skills.rolePlayMode && (
                  <Field label="Scenario Brief" value={agent.behavior.scenarioBrief} />
                )}
              </Section>
            </div>
            
            <div style={{ breakInside: 'avoid' }}>
              <Section title="Knowledge">
                <Field
                  label="Question source"
                  value={agent.knowledge.mode === 'knowledge_base'
                    ? `Knowledge base (${agent.knowledge.items.length} questions, ${agent.knowledge.strict ? 'strict' : 'guided'})`
                    : 'Model-generated'}
                />
              </Section>

              <Section title="Interview Logic">
                <Field label="Difficulty Band" value={`${agent.logic.difficultyBand[0]} → ${agent.logic.difficultyBand[1]}`} />
                <Field label="Follow-up aggressiveness" value={`${agent.logic.followUpAggressiveness} / 10`} />
                <Field label="Max turns before handoff" value={agent.logic.maxTurns} />
              </Section>
            </div>

            <div style={{ breakInside: 'avoid' }}>
              <Section title="Skills & Tools">
                <Field label="Role-play / scenario mode" value={agent.skills.rolePlayMode ? 'Enabled' : 'Disabled'} />
                <Field label="Loop until satisfied" value={agent.skills.loopUntilSatisfied ? 'Enabled' : 'Disabled'} />
                <Field label="Contradiction probing" value={agent.skills.contradictionProbing ? 'Enabled' : 'Disabled'} />
                <Field label="Tools Enabled" value="None" />
              </Section>
            </div>

            <div style={{ breakInside: 'avoid' }}>
              <Section title="Turn-taking & Scoring">
                <Field label="Can open the interview" value={agent.turnTaking.canOpen ? 'Yes' : 'No'} />
                <Field label="Priority weight" value={agent.turnTaking.priority} />
                <Field label="Handoff triggers" value={agent.turnTaking.handoffTriggers} />
                <Field label="Scoring Competencies" value={agent.scoring.competencies.join(', ')} />
              </Section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
