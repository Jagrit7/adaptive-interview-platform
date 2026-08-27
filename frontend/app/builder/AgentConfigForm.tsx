'use client';

import React, { useState } from 'react';
import { Agent, useBuilderStore, RoleType } from '@/store/builderStore';
import { Field, Input, Select, Textarea, Switch, Slider, Chips } from '@/components/ui/FormElements';

function Section({ title, defaultOpen = false, children }: { title: string, defaultOpen?: boolean, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div style={{ marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          width: '100%', 
          padding: '16px 24px', 
          backgroundColor: 'var(--surface-raised)', 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          border: 'none',
          color: 'var(--text-primary)',
          fontWeight: 500,
          fontFamily: 'var(--font-display)'
        }}
      >
        <span style={{ fontSize: '18px' }}>{title}</span>
        <span>{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <div style={{ padding: '24px', backgroundColor: 'var(--surface)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function AgentConfigForm({ agent }: { agent: Agent }) {
  const { updateAgent, deleteAgent } = useBuilderStore();

  const handleChange = (section: keyof Agent, field: string, value: any) => {
    updateAgent(agent.id, {
      [section]: {
        ...(agent[section] as any),
        [field]: value
      }
    });
  };

  const roleOptions = [
    { label: 'Technical', value: 'Technical' },
    { label: 'Hiring manager', value: 'Hiring manager' },
    { label: 'Product', value: 'Product' },
    { label: 'Customer', value: 'Customer' },
    { label: 'Behavioural', value: 'Behavioural' },
    { label: 'Custom', value: 'Custom' },
  ];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: '32px' }}>
        <h1 className="text-display" style={{ color: 'var(--role-accent)' }}>{agent.identity.name}</h1>
        <button 
          onClick={() => deleteAgent(agent.id)}
          style={{ color: 'var(--accent-rose)', cursor: 'pointer', fontSize: '14px', padding: '8px', borderRadius: '4px' }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--border)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          Remove Agent
        </button>
      </div>

      <Section title="Identity" defaultOpen={true}>
        <Field label="Name">
          <Input 
            value={agent.identity.name} 
            onChange={(e) => handleChange('identity', 'name', e.target.value)} 
          />
        </Field>
        <Field label="Role">
          <Select 
            options={roleOptions} 
            value={agent.identity.role} 
            onChange={(val) => handleChange('identity', 'role', val)} 
          />
        </Field>
      </Section>

      <Section title="Voice" defaultOpen={true}>
        <div className="flex gap-4">
          <div className="w-full">
            <Field label="Voice Model">
              <Select 
                options={[{label: 'ElevenLabs: Default', value: 'default'}, {label: 'OpenAI: Alloy', value: 'alloy'}]} 
                value={agent.voice.voiceId} 
                onChange={(val) => handleChange('voice', 'voiceId', val)} 
              />
            </Field>
          </div>
          <div className="w-full">
            <Field label="Language">
              <Select 
                options={[{label: 'English (US)', value: 'en-US'}, {label: 'English (UK)', value: 'en-UK'}]} 
                value={agent.voice.language} 
                onChange={(val) => handleChange('voice', 'language', val)} 
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Behavior & Prompt" defaultOpen={true}>
        <Field label="System Prompt">
          <Textarea 
            value={agent.behavior.systemPrompt} 
            onChange={(e) => handleChange('behavior', 'systemPrompt', e.target.value)} 
            style={{ minHeight: '160px', fontFamily: 'var(--font-mono)' }}
          />
        </Field>
        {agent.turnTaking.canOpen && (
          <Field label="Greeting Message">
            <Input 
              value={agent.behavior.greetingMessage} 
              onChange={(e) => handleChange('behavior', 'greetingMessage', e.target.value)} 
            />
          </Field>
        )}
        {agent.skills.rolePlayMode && (
          <Field label="Scenario Brief">
            <Textarea 
              value={agent.behavior.scenarioBrief} 
              onChange={(e) => handleChange('behavior', 'scenarioBrief', e.target.value)} 
              placeholder="Describe the context for the role-play..."
            />
          </Field>
        )}
      </Section>

      <Section title="Interview Logic">
        <Field label="Follow-up aggressiveness (1-10)" description="Light touch vs probing deeply">
          <Slider 
            min={1} max={10} 
            value={agent.logic.followUpAggressiveness} 
            onChange={(val) => handleChange('logic', 'followUpAggressiveness', val)} 
          />
        </Field>
        <Field label="Max turns before handoff">
          <Input 
            type="number" 
            value={agent.logic.maxTurns} 
            onChange={(e) => handleChange('logic', 'maxTurns', Number(e.target.value))} 
            style={{ maxWidth: '120px' }}
          />
        </Field>
      </Section>

      <Section title="Skills">
        <div className="flex flex-col gap-4">
          <Switch 
            label="Role-play / scenario mode" 
            checked={agent.skills.rolePlayMode} 
            onChange={(val) => handleChange('skills', 'rolePlayMode', val)} 
          />
          <Switch 
            label="Loop until satisfied" 
            checked={agent.skills.loopUntilSatisfied} 
            onChange={(val) => handleChange('skills', 'loopUntilSatisfied', val)} 
          />
          <Switch 
            label="Contradiction / vagueness probing" 
            checked={agent.skills.contradictionProbing} 
            onChange={(val) => handleChange('skills', 'contradictionProbing', val)} 
          />
        </div>
      </Section>

      <Section title="Turn-taking">
        <div className="flex flex-col gap-6">
          <Switch 
            label="Can open the interview" 
            checked={agent.turnTaking.canOpen} 
            onChange={(val) => handleChange('turnTaking', 'canOpen', val)} 
          />
          <Field label="Priority weight">
            <Select 
              options={[
                {label: 'Low', value: 'low'},
                {label: 'Medium', value: 'medium'},
                {label: 'High', value: 'high'}
              ]}
              value={agent.turnTaking.priority}
              onChange={(val) => handleChange('turnTaking', 'priority', val)}
            />
          </Field>
          <Field label="Handoff triggers" description="E.g., 'Hands off to Product when business impact not addressed'">
            <Textarea 
              value={agent.turnTaking.handoffTriggers}
              onChange={(e) => handleChange('turnTaking', 'handoffTriggers', e.target.value)}
              style={{ minHeight: '80px' }}
            />
          </Field>
        </div>
      </Section>

      <Section title="Scoring Input">
        <Field label="Competencies this agent owns" description="Comma-separated list (e.g. System Design, Communication)">
          <Input 
            value={agent.scoring.competencies.join(', ')}
            onChange={(e) => {
              const comps = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
              handleChange('scoring', 'competencies', comps);
            }}
            placeholder="System Design, Algorithms"
          />
        </Field>
      </Section>
    </div>
  );
}
