'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Agent, useBuilderStore, RoleType, roleColors, defaultSystemPrompts } from '@/store/builderStore';
import { Field, Input, Select, Textarea, Switch, Slider } from '@/components/ui/FormElements';
import { GlassTile } from '@/components/ui/GlassTile';
import { KnowledgeBaseForm } from './KnowledgeBaseForm';
import {
  FALLBACK_LANGUAGES,
  LanguageOption,
  fetchLanguages,
  isLanguageDefault,
  previewVoice,
} from '@/lib/languages';

const LAST_STEP = 8;

// Languages whose greeting should not be plain Latin script. Latin-script
// languages (Spanish, French, German...) are excluded because an English
// greeting there is a mistake we cannot detect by character range alone.
const NON_LATIN_LANGUAGES = new Set([
  'hi-IN', 'ru-RU', 'ja-JP', 'ko-KR', 'zh-CN', 'ar-SA', 'th-TH',
]);

export function AgentConfigForm({ agent }: { agent: Agent }) {
  const { updateAgent, deleteAgent, saveProject, agents, language, setLanguage,
          isSaving, saveError, lastSavedAt } = useBuilderStore();
  const [activeStep, setActiveStep] = useState(agent.isNew ? 0 : 1);

  // The dropdown renders immediately from the static mirror, then swaps to the
  // backend's list so app/config/voice_profiles.py stays the single source of
  // truth. A backend that's down just leaves the fallback in place.
  const [languages, setLanguages] = useState<LanguageOption[]>(FALLBACK_LANGUAGES);
  useEffect(() => {
    let cancelled = false;
    fetchLanguages()
      .then((list) => { if (!cancelled && list.length) setLanguages(list); })
      .catch(() => { /* fallback list already rendered */ });
    return () => { cancelled = true; };
  }, []);

  const activeLanguage = useMemo(
    () => languages.find((l) => l.code === language),
    [languages, language]
  );
  const agentIndex = agents.findIndex((a) => a.id === agent.id);
  const assignedVoice = previewVoice(Math.max(agentIndex, 0), activeLanguage);

  // Both the greeting and the fallback are handed to TTS verbatim - the model
  // never sees them and cannot translate them. So Latin-script text on a
  // non-Latin-script panel gets read out in English regardless of the language
  // setting. Warn rather than overwrite: silently replacing someone's own words
  // would be worse than letting them hear the mismatch and fix it.
  const looksLatinOnly = (text: string) =>
    text.trim().length > 0 && !/[^\u0000-\u024F]/.test(text);

  const scriptMismatch =
    !!activeLanguage &&
    !activeLanguage.code.startsWith('en') &&
    NON_LATIN_LANGUAGES.has(activeLanguage.code);

  const greetingScriptMismatch =
    scriptMismatch && looksLatinOnly(agent.behavior.greetingMessage);
  const fallbackScriptMismatch =
    scriptMismatch && looksLatinOnly(agent.behavior.fallbackMessage);

  // When the language changes, swap in that language's greeting and fallback -
  // but ONLY if the current text is blank or is still a built-in default from
  // some other language. Text the user wrote themselves is left alone.
  const prevLanguageRef = React.useRef(language);
  useEffect(() => {
    if (prevLanguageRef.current === language) return;
    prevLanguageRef.current = language;
    if (!activeLanguage?.defaultGreeting) return;   // list not loaded yet

    const patch: Partial<Agent['behavior']> = {};
    if (isLanguageDefault(agent.behavior.greetingMessage, languages)) {
      patch.greetingMessage = activeLanguage.defaultGreeting;
    }
    if (isLanguageDefault(agent.behavior.fallbackMessage, languages)) {
      patch.fallbackMessage = activeLanguage.defaultFallback;
    }
    if (Object.keys(patch).length > 0) {
      updateAgent(agent.id, { behavior: { ...agent.behavior, ...patch } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, activeLanguage]);

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
    'Knowledge',
    'Skills',
    'Tools',
    'Turn-taking & Scoring'
  ];

  const step0Content = (
    <div style={{ padding: '0 8px' }}>
      <h2 className="text-heading" style={{ marginBottom: '24px', color: 'var(--text-primary)' }}>Choose a role</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {[
          { name: "Technical", role: "Senior Software Engineer", description: "Focus on system design, data structures, and algorithms.", color: "var(--accent-indigo)" },
          { name: "Hiring manager", role: "Engineering Director", description: "Focus on team fit, long-term potential, and leadership.", color: "var(--accent-teal)" },
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
          if (activeStep < LAST_STEP) setActiveStep(activeStep + 1);
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
        {activeStep === LAST_STEP ? 'Finish' : 'Next'}
      </button>
    </div>
  );

  return (
    <div style={{ width: '100%', maxWidth: 'none', margin: '0 auto', paddingBottom: '64px', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="flex justify-between items-center w-full" style={{ marginBottom: '16px' }}>
        <h1 className="text-display" style={{ color: 'var(--role-accent)', margin: 0 }}>{agent.identity.name}</h1>
        <div className="flex gap-2 items-center">
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
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
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

      {(saveError || lastSavedAt) && (
        <div style={{
          marginBottom: '12px', padding: '8px 12px', borderRadius: '6px',
          fontSize: '12px', lineHeight: 1.5,
          border: `1px solid ${saveError ? 'var(--accent-rose)' : 'var(--border)'}`,
          color: saveError ? 'var(--accent-rose)' : 'var(--text-muted)',
        }}>
          {saveError ? `Not saved. ${saveError}`
                     : `Saved at ${new Date(lastSavedAt as number).toLocaleTimeString()}.`}
        </div>
      )}

      {stepperUI}

      {activeStep === 0 && step0Content}

      {/* Active Step Content */}
      {activeStep > 0 && (
        <div style={{ padding: '0 8px' }}>
          <h2 className="text-heading" style={{ marginBottom: '24px', color: 'var(--text-primary)' }}>
            {steps[activeStep - 1]}
          </h2>

          {activeStep === 1 && (
            <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
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

          {/* ---- Voice: language is the only control ---- */}
          {activeStep === 2 && (
            <div className="flex flex-col gap-6" style={{ maxWidth: '640px' }}>
              <Field
                label="Interview language"
                description="Applies to the whole panel, not just this agent - the live session runs one speech pipeline, and its language is fixed when the session starts."
              >
                <Select
                  options={languages.map((l) => ({ label: l.label, value: l.code }))}
                  value={language}
                  onChange={(val) => setLanguage(val)}
                />
              </Field>

              <GlassTile style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                  Speech engine
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
                  Chosen automatically from the language. Nothing here needs configuring, and no extra
                  API keys are required - both run on Agora's managed credentials.
                </p>
                <ReadOnlyRow
                  label="Speech to text"
                  value={activeLanguage ? `${cap(activeLanguage.sttVendor)} ${activeLanguage.sttModel} (${activeLanguage.code})` : '—'}
                />
                <ReadOnlyRow
                  label="Text to speech"
                  value={activeLanguage ? `${cap(activeLanguage.ttsVendor)} ${activeLanguage.ttsModel}` : '—'}
                />
                <ReadOnlyRow
                  label="This agent's voice"
                  value={assignedVoice ? `${assignedVoice.label} (${assignedVoice.gender})` : 'Assigned when the session starts'}
                />
              </GlassTile>

              {agent.turnTaking.canOpen && (
                <Field
                  label="Greeting message"
                  description="The first thing the candidate hears. Spoken word-for-word by the voice engine."
                >
                  <Input
                    value={agent.behavior.greetingMessage}
                    onChange={(e) => handleChange('behavior', 'greetingMessage', e.target.value)}
                    placeholder={activeLanguage?.defaultGreeting ?? ''}
                  />
                  <ScriptWarning
                    show={greetingScriptMismatch}
                    language={activeLanguage}
                    suggestion={activeLanguage?.defaultGreeting}
                    onUse={(text) => handleChange('behavior', 'greetingMessage', text)}
                  />
                </Field>
              )}

              <Field
                label="Fallback message"
                description="Spoken when the agent doesn't understand the candidate. Also word-for-word."
              >
                <Textarea
                  value={agent.behavior.fallbackMessage}
                  onChange={(e) => handleChange('behavior', 'fallbackMessage', e.target.value)}
                  placeholder={activeLanguage?.defaultFallback ?? ''}
                  style={{ minHeight: '72px' }}
                />
                <ScriptWarning
                  show={fallbackScriptMismatch}
                  language={activeLanguage}
                  suggestion={activeLanguage?.defaultFallback}
                  onUse={(text) => handleChange('behavior', 'fallbackMessage', text)}
                />
              </Field>

              <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                Both lines are read out exactly as typed - the model never sees them, so it cannot
                translate them. Changing the language above rewrites them for you, unless you have
                edited them yourself.
              </p>

              {agents.length > 1 && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                  Each agent is given a different voice from the language's pool where one is available.
                  Note that the current single-instance session cannot change voice mid-interview, so in
                  practice the whole panel speaks with the opening agent's voice until multi-instance
                  sessions land.
                </p>
              )}
            </div>
          )}

          {activeStep === 3 && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 flex flex-col">
                  <Field label="System Prompt" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <Textarea
                      value={agent.behavior.systemPrompt}
                      onChange={(e) => handleChange('behavior', 'systemPrompt', e.target.value)}
                      style={{ flexGrow: 1, minHeight: '180px', fontFamily: 'var(--font-mono)' }}
                    />
                  </Field>
                </div>
                <div className="col-span-1 flex flex-col gap-6">
                  <div style={{
                    padding: '14px 16px', borderRadius: '8px', fontSize: '12px',
                    lineHeight: 1.6, color: 'var(--text-muted)',
                    border: '1px solid var(--border)', backgroundColor: 'var(--surface)',
                  }}>
                    Greeting and fallback lines have moved to the{' '}
                    <button
                      onClick={() => setActiveStep(2)}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        color: agent.identity.color, fontSize: '12px', textDecoration: 'underline',
                      }}
                    >
                      Voice step
                    </button>
                    . They are spoken word-for-word by the voice engine rather than written by
                    the model, so they belong with the language setting that determines what
                    language they need to be in.
                  </div>
                </div>
              </div>

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
            <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
              <div className="flex gap-4">
                <Field label="Start Difficulty (1-10)" style={{ flex: 1 }}>
                  <Input
                    type="number"
                    min={1} max={10}
                    value={agent.logic.difficultyBand[0]}
                    onChange={(e) => handleChange('logic', 'difficultyBand', [Number(e.target.value), agent.logic.difficultyBand[1]])}
                  />
                </Field>
                <Field label="Max Difficulty (1-10)" style={{ flex: 1 }}>
                  <Input
                    type="number"
                    min={1} max={10}
                    value={agent.logic.difficultyBand[1]}
                    onChange={(e) => handleChange('logic', 'difficultyBand', [agent.logic.difficultyBand[0], Number(e.target.value)])}
                  />
                </Field>
              </div>
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
                />
              </Field>
              <Field label="Max visits" description="How many times this agent can be revisited before it's force-closed">
                <Input
                  type="number"
                  value={agent.logic.maxVisits}
                  onChange={(e) => handleChange('logic', 'maxVisits', Number(e.target.value))}
                />
              </Field>
            </div>
          )}

          {/* ---- Knowledge ---- */}
          {activeStep === 5 && <KnowledgeBaseForm agent={agent} />}

          {activeStep === 6 && (
            <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
              <GlassTile style={{ padding: '16px' }}>
                <Switch
                  label="Role-play / scenario mode"
                  checked={agent.skills.rolePlayMode}
                  onChange={(val) => handleChange('skills', 'rolePlayMode', val)}
                />
              </GlassTile>
              <GlassTile style={{ padding: '16px' }}>
                <Switch
                  label="Loop until satisfied"
                  checked={agent.skills.loopUntilSatisfied}
                  onChange={(val) => handleChange('skills', 'loopUntilSatisfied', val)}
                />
              </GlassTile>
              <GlassTile style={{ padding: '16px' }}>
                <Switch
                  label="Contradiction / vagueness probing"
                  checked={agent.skills.contradictionProbing}
                  onChange={(val) => handleChange('skills', 'contradictionProbing', val)}
                />
              </GlassTile>
            </div>
          )}

          {activeStep === 7 && (
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

          {activeStep === 8 && (
            <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
              <GlassTile style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>Turn-taking</h3>
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
                <Field label="Handoff triggers" description="E.g., 'Hands off to Product when business impact not addressed'" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <Textarea
                    value={agent.turnTaking.handoffTriggers}
                    onChange={(e) => handleChange('turnTaking', 'handoffTriggers', e.target.value)}
                    style={{ flexGrow: 1, minHeight: '120px' }}
                  />
                </Field>
              </GlassTile>

              <GlassTile style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>Scoring Input</h3>
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
              </GlassTile>
            </div>
          )}
        </div>
      )}

      {navButtons}
    </div>
  );
}

function ScriptWarning({
  show, language, suggestion, onUse,
}: {
  show: boolean;
  language: LanguageOption | undefined;
  suggestion: string | undefined;
  onUse: (text: string) => void;
}) {
  if (!show || !language) return null;
  return (
    <div style={{
      marginTop: '8px', padding: '10px 12px', borderRadius: '6px',
      fontSize: '12px', lineHeight: 1.5,
      border: '1px solid var(--accent-amber)', color: 'var(--accent-amber)',
      backgroundColor: 'rgba(245,158,11,0.06)',
    }}>
      This looks like English, but the panel is set to {language.label}. It is read out exactly
      as typed, so it will be spoken in English.
      {suggestion && (
        <button
          onClick={() => onUse(suggestion)}
          style={{
            display: 'block', marginTop: '8px', padding: '5px 10px', fontSize: '12px',
            borderRadius: '4px', cursor: 'pointer', border: '1px solid var(--accent-amber)',
            background: 'transparent', color: 'var(--accent-amber)',
          }}
        >
          Use the {language.label} version
        </button>
      )}
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '7px 0' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: '13px', color: 'var(--text-primary)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        {value}
      </span>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
