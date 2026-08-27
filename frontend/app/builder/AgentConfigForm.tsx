'use client';

import React, { useState } from 'react';
import { Agent, useBuilderStore, RoleType, roleColors, defaultSystemPrompts } from '@/store/builderStore';
import { Field, Input, Select, Textarea, Switch, Slider, Chips } from '@/components/ui/FormElements';
import { GlassTile } from '@/components/ui/GlassTile';

export function AgentConfigForm({ agent }: { agent: Agent }) {
  const { updateAgent, deleteAgent, saveProject } = useBuilderStore();
  const [activeStep, setActiveStep] = useState(agent.isNew ? 0 : 1);

  const handleChange = (section: keyof Agent, field: string, value: any) => {
    updateAgent(agent.id, {
      [section]: {
        ...(agent[section] as any),
        [field]: value
      }
    });
  };

  const handleSelectRole = (role: RoleType) => {
    updateAgent(agent.id, {
      isNew: false,
      identity: {
        ...agent.identity,
        role: role,
        color: roleColors[role] || 'var(--text-primary)',
        name: role === 'Custom' ? 'New Agent' : `New ${role} Agent`
      },
      behavior: {
        ...agent.behavior,
        systemPrompt: defaultSystemPrompts[role] || ''
      }
    });
    setActiveStep(1);
  };

  const roleOptions = [
    { label: 'Technical', value: 'Technical' },
    { label: 'Hiring manager', value: 'Hiring manager' },
    { label: 'Product', value: 'Product' },
    { label: 'Customer', value: 'Customer' },
    { label: 'Behavioural', value: 'Behavioural' },
    { label: 'Custom', value: 'Custom' },
  ];

  const steps = [
    'Identity',
    'Voice',
    'Prompt',
    'Interview logic',
    'Skills',
    'Tools',
    'Turn-taking & Scoring'
  ];

  const enabledSkillsCount = Object.values(agent.skills).filter(Boolean).length;

  const step0Content = (
    <div style={{ padding: '0 8px' }}>
      <h2 className="text-heading" style={{ marginBottom: '24px', color: 'var(--text-primary)' }}>Choose a role</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {[
          { name: "Technical", role: "Senior Software Engineer", description: "Focus on system design, data structures, and algorithms.", color: "var(--accent-indigo)" },
          { name: "Hiring Manager", role: "Engineering Director", description: "Focus on team fit, long-term potential, and leadership.", color: "var(--accent-teal)" },
          { name: "Product", role: "Product Manager", description: "Evaluating business sense, product intuition.", color: "var(--accent-amber)" },
          { name: "Customer", role: "Enterprise Customer", description: "Demanding but fair role-play scenario.", color: "var(--accent-rose)" },
          { name: "Behavioural", role: "HR Representative", description: "Conducts behavioral interview using the STAR method.", color: "var(--accent-violet)" },
          { name: "Custom", role: "Build from scratch", description: "Start with a blank slate and configure everything yourself.", color: "var(--text-primary)" }
        ].map((r, i) => (
          <div key={i} onClick={() => handleSelectRole(r.name as RoleType)} style={{ cursor: 'pointer' }}>
            <GlassTile>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: r.color }} />
                <span style={{ fontWeight: 600, fontSize: '15px' }}>{r.name}</span>
              </div>
              <span style={{ fontSize: '13px', opacity: 0.7, marginBottom: '12px', display: 'block' }}>{r.role}</span>
              <p style={{ fontSize: '13px', opacity: 0.6, lineHeight: 1.4, flexGrow: 1 }}>{r.description}</p>
              <div style={{ marginTop: '16px', height: '24px', opacity: 0.5, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '100%' }}>
                  {[12, 24, 16, 8, 14, 20, 10].map((h, j) => (
                    <div key={j} style={{ width: '3px', height: `${h}px`, backgroundColor: r.color, borderRadius: '2px' }} />
                  ))}
                </div>
              </div>
            </GlassTile>
          </div>
        ))}
      </div>
    </div>
  );

  const stepperUI = activeStep > 0 && (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', alignItems: 'center', justifyContent: 'center' }}>
      {steps.map((stepName, idx) => {
        const stepNum = idx + 1;
        const isActive = activeStep === stepNum;
        const isVisited = !agent.isNew || stepNum <= activeStep;
        const color = isVisited ? agent.identity.color : 'var(--border)';
        
        return (
          <button
            key={stepName}
            onClick={() => { if (isVisited) setActiveStep(stepNum); }}
            title={stepName}
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: isActive ? color : 'transparent',
              border: `2px solid ${color}`,
              cursor: isVisited ? 'pointer' : 'default',
              padding: 0
            }}
          />
        );
      })}
    </div>
  );

  const navButtons = activeStep > 0 && (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
      <button
        disabled={activeStep <= 1}
        onClick={() => setActiveStep(activeStep - 1)}
        style={{
          padding: '8px 16px',
          borderRadius: '6px',
          backgroundColor: 'var(--surface-raised)',
          color: activeStep <= 1 ? 'var(--text-muted)' : 'var(--text-primary)',
          cursor: activeStep <= 1 ? 'not-allowed' : 'pointer',
          border: '1px solid var(--border)',
          fontWeight: 500
        }}
      >
        Back
      </button>
      
      <button
        onClick={() => {
          if (activeStep < 7) setActiveStep(activeStep + 1);
          else saveProject();
        }}
        style={{
          padding: '8px 16px',
          borderRadius: '6px',
          backgroundColor: agent.identity.color,
          color: '#fff',
          cursor: 'pointer',
          border: 'none',
          fontWeight: 500
        }}
      >
        {activeStep === 7 ? 'Finish' : 'Next'}
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      {/* Header */}
      <div className="flex justify-between items-center" style={{ marginBottom: '16px' }}>
        <h1 className="text-display" style={{ color: 'var(--role-accent)', margin: 0 }}>{agent.identity.name}</h1>
        <div className="flex gap-2 items-center">
          <button 
            style={{ 
              padding: '8px 16px', 
              borderRadius: '6px', 
              border: '1px solid var(--border)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '14px'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-raised)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--surface)'}
            onClick={() => alert('Talk function not fully implemented yet')}
          >
            Talk
          </button>
          <button 
            style={{ 
              padding: '8px 16px', 
              borderRadius: '6px', 
              border: 'none',
              backgroundColor: agent.identity.color,
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '14px'
            }}
            onClick={saveProject}
          >
            Save
          </button>
          <button 
            onClick={() => deleteAgent(agent.id)}
            style={{ 
              color: 'var(--accent-rose)', 
              cursor: 'pointer', 
              fontSize: '14px', 
              padding: '8px 12px', 
              borderRadius: '4px', 
              backgroundColor: 'transparent', 
              border: 'none', 
              marginLeft: '8px',
              fontWeight: 500
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--border)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Live Summary Strip */}
      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        alignItems: 'center', 
        padding: '12px 16px', 
        backgroundColor: 'var(--surface)', 
        borderRadius: '8px',
        fontSize: '13px',
        color: 'var(--text-secondary)',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: agent.identity.color }}></div>
          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{agent.identity.role}</span>
        </div>
        <span>•</span>
        <span>Difficulty: {agent.logic.difficultyBand[0]} → {agent.logic.difficultyBand[1]}</span>
        <span>•</span>
        <span>{agent.voice.provider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'}: {agent.voice.voiceId}</span>
        <span>•</span>
        <span>{enabledSkillsCount} of 3 skills on</span>
      </div>

      {stepperUI}

      {activeStep === 0 && step0Content}

      {/* Active Step Content */}
      {activeStep > 0 && (
        <div style={{ padding: '0 8px' }}>
          <h2 className="text-heading" style={{ marginBottom: '24px', color: 'var(--text-primary)' }}>
            {steps[activeStep - 1]}
          </h2>
          
          {activeStep === 1 && (
            <div className="flex flex-col gap-6">
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
            </div>
          )}

          {activeStep === 2 && (
            <div className="flex flex-col gap-6">
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
            </div>
          )}

          {activeStep === 3 && (
            <div className="flex flex-col gap-6">
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
              <Field label="Fallback Message" description="Message to use when the agent doesn't understand the user">
                <Input 
                  value={agent.behavior.fallbackMessage} 
                  onChange={(e) => handleChange('behavior', 'fallbackMessage', e.target.value)} 
                />
              </Field>
              {agent.skills.rolePlayMode && (
                <Field label="Scenario Brief">
                  <Textarea 
                    value={agent.behavior.scenarioBrief} 
                    onChange={(e) => handleChange('behavior', 'scenarioBrief', e.target.value)} 
                    placeholder="Describe the context for the role-play..."
                  />
                </Field>
              )}
            </div>
          )}

          {activeStep === 4 && (
            <div className="flex flex-col gap-6">
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
            </div>
          )}

          {activeStep === 5 && (
            <div className="flex flex-col gap-6">
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
          )}

          {activeStep === 6 && (
            <div className="flex flex-col gap-6">
              <div style={{
                padding: '48px',
                textAlign: 'center',
                backgroundColor: 'var(--surface)',
                borderRadius: '8px',
                border: '1px dashed var(--border)',
                color: 'var(--text-secondary)'
              }}>
                No tools currently enabled for this agent.
              </div>
            </div>
          )}

          {activeStep === 7 && (
            <div className="flex flex-col gap-6">
              <div style={{ marginBottom: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '16px' }}>Turn-taking</h3>
                <div className="flex flex-col gap-6 pl-4" style={{ borderLeft: '2px solid var(--border)' }}>
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
              </div>

              <div style={{ marginTop: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '16px' }}>Scoring Input</h3>
                <div className="pl-4" style={{ borderLeft: '2px solid var(--border)' }}>
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
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {navButtons}
    </div>
  );
}
