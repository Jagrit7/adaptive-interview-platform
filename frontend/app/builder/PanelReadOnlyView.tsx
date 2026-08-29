import React from 'react';
import { useBuilderStore } from '@/store/builderStore';
import { FALLBACK_LANGUAGES, LanguageOption, fetchLanguages, languageLabel, previewVoice } from '@/lib/languages';

export function PanelReadOnlyView({ onClose }: { onClose: () => void }) {
  const { agents, scorer, language } = useBuilderStore();
  const [languages, setLanguages] = React.useState<LanguageOption[]>(FALLBACK_LANGUAGES);

  React.useEffect(() => {
    fetchLanguages().then(setLanguages).catch(() => { /* fallback list already rendered */ });
  }, []);

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 10, 12, 0.8)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        padding: '24px 32px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--surface)'
      }}>
        <h2 className="text-display" style={{ fontSize: '24px', margin: 0 }}>Panel Overview</h2>
        <button 
          onClick={onClose}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            backgroundColor: 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontWeight: 500
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-raised)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          Close
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {agents.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '64px' }}>
              No agents have been configured for this panel yet.
            </div>
          )}

          {agents.map((agent, index) => (
            <div key={agent.id} style={{ 
              backgroundColor: 'var(--surface)', 
              border: '1px solid var(--border)', 
              borderRadius: '12px',
              overflow: 'hidden'
            }}>
              <div style={{ 
                padding: '16px 24px', 
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)'
              }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: agent.identity.color }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '18px', color: 'var(--text-primary)' }}>{agent.identity.name}</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{agent.identity.role}</div>
                </div>
              </div>

              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <Section title="1. Identity">
                  <DataRow label="Name" value={agent.identity.name} />
                  <DataRow label="Role" value={agent.identity.role} />
                </Section>

                <Section title="2. Voice">
                  <DataRow label="Language" value={`${languageLabel(language, languages)} (${language})`} />
                  <DataRow label="Speech to text" value={sttSummary(language, languages)} />
                  <DataRow label="Text to speech" value={ttsSummary(language, languages)} />
                  <DataRow label="Voice" value={voiceSummary(index, language, languages)} />
                </Section>

                <Section title="3. Prompt">
                  <DataRow label="System Prompt" value={agent.behavior.systemPrompt} isBlock />
                  {agent.turnTaking.canOpen && (
                    <DataRow label="Greeting Message" value={agent.behavior.greetingMessage} isBlock />
                  )}
                  <DataRow label="Fallback Message" value={agent.behavior.fallbackMessage} isBlock />
                  {agent.skills.rolePlayMode && (
                    <DataRow label="Scenario Brief" value={agent.behavior.scenarioBrief} isBlock />
                  )}
                </Section>

                <Section title="4. Interview logic">
                  <DataRow label="Difficulty Band" value={`${agent.logic.difficultyBand[0]} to ${agent.logic.difficultyBand[1]}`} />
                  <DataRow label="Follow-up aggressiveness" value={`${agent.logic.followUpAggressiveness} / 10`} />
                  <DataRow label="Max turns before handoff" value={agent.logic.maxTurns.toString()} />
                </Section>

                <Section title="5. Knowledge">
                  <DataRow
                    label="Question source"
                    value={agent.knowledge.mode === 'knowledge_base'
                      ? `Knowledge base - ${agent.knowledge.items.length} question${agent.knowledge.items.length === 1 ? '' : 's'}`
                      : 'Model-generated (no knowledge base)'}
                  />
                  {agent.knowledge.mode === 'knowledge_base' && (
                    <>
                      <DataRow
                        label="Scope"
                        value={agent.knowledge.strict
                          ? 'Strict - asks nothing outside the knowledge base'
                          : 'Guided - covers the knowledge base first, then improvises'}
                      />
                      <DataRow
                        label="With ideal answers"
                        value={`${agent.knowledge.items.filter(i => i.idealAnswer.trim()).length} of ${agent.knowledge.items.length}`}
                      />
                      {agent.knowledge.sourceName && (
                        <DataRow label="Source file" value={agent.knowledge.sourceName} />
                      )}
                    </>
                  )}
                </Section>

                <Section title="6. Skills">
                  <DataRow label="Role-play / scenario mode" value={agent.skills.rolePlayMode ? 'Enabled' : 'Disabled'} />
                  <DataRow label="Loop until satisfied" value={agent.skills.loopUntilSatisfied ? 'Enabled' : 'Disabled'} />
                  <DataRow label="Contradiction probing" value={agent.skills.contradictionProbing ? 'Enabled' : 'Disabled'} />
                </Section>

                <Section title="7. Tools">
                  <DataRow label="Enabled Tools" value={agent.tools.length > 0 ? agent.tools.join(', ') : 'None'} />
                </Section>

                <Section title="8. Turn-taking & Scoring">
                  <DataRow label="Can open interview" value={agent.turnTaking.canOpen ? 'Yes' : 'No'} />
                  <DataRow label="Priority weight" value={agent.turnTaking.priority} />
                  <DataRow label="Handoff triggers" value={agent.turnTaking.handoffTriggers || 'None'} isBlock />
                  <DataRow label="Owned Competencies" value={agent.scoring.competencies.join(', ') || 'None'} />
                </Section>
              </div>
            </div>
          ))}

          <div style={{ 
            backgroundColor: 'var(--surface)', 
            border: '1px solid var(--border)', 
            borderRadius: '12px',
            overflow: 'hidden',
            marginBottom: '32px'
          }}>
            <div style={{ 
              padding: '16px 24px', 
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)'
            }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'var(--accent-slate)' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '18px', color: 'var(--text-primary)' }}>Scorer Settings</div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Global Panel Rubric</div>
              </div>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <Section title="Competency Rules">
                {scorer.competencies && scorer.competencies.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {scorer.competencies.map((comp, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 500, flex: 1 }}>{comp.name}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>Weight: {comp.weight}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>Threshold: {comp.threshold}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)' }}>No competencies defined.</div>
                )}
              </Section>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div>
      <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '12px' }}>
        {title}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {children}
      </div>
    </div>
  );
}

function DataRow({ label, value, isBlock = false }: { label: string, value: string, isBlock?: boolean }) {
  if (isBlock) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
        <div style={{ 
          backgroundColor: 'rgba(255,255,255,0.03)', 
          padding: '12px', 
          borderRadius: '6px', 
          fontSize: '14px', 
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'pre-wrap',
          color: 'var(--text-primary)'
        }}>
          {value || <span style={{ color: 'var(--text-muted)' }}>Empty</span>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', width: '200px', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

// Speech config is derived from the panel language, so the overview reports what
// will actually run instead of echoing fields the user no longer controls.
function sttSummary(code: string, languages: LanguageOption[]): string {
  const l = languages.find(x => x.code === code);
  return l ? `${l.sttVendor} ${l.sttModel}` : '-';
}

function ttsSummary(code: string, languages: LanguageOption[]): string {
  const l = languages.find(x => x.code === code);
  return l ? `${l.ttsVendor} ${l.ttsModel}` : '-';
}

function voiceSummary(index: number, code: string, languages: LanguageOption[]): string {
  const voice = previewVoice(index, languages.find(x => x.code === code));
  return voice ? voice.label : 'Assigned at session start';
}
