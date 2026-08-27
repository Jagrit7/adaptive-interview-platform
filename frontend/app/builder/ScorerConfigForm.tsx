'use client';

import React, { useMemo } from 'react';
import { useBuilderStore } from '@/store/builderStore';
import { Field, Slider, Switch, Input } from '@/components/ui/FormElements';

export function ScorerConfigForm() {
  const { agents, scorer, updateScorer } = useBuilderStore();

  // Auto-populate competencies from all agents
  const allCompetencies = useMemo(() => {
    const comps = new Set<string>();
    agents.forEach(a => {
      a.scoring.competencies.forEach(c => comps.add(c));
    });
    return Array.from(comps);
  }, [agents]);

  // Sync scorer config with available competencies
  // In a real app we'd do this carefully to not override user edits
  // For now, we'll just display them.

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: '32px' }}>
        <h1 className="text-display" style={{ color: 'var(--accent-slate)' }}>Scorer Configuration</h1>
      </div>

      <div style={{ marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', backgroundColor: 'var(--surface)' }}>
        <h2 className="text-heading" style={{ marginBottom: '24px' }}>Global Settings</h2>
        
        <Field label="Satisfaction threshold (0-10)" description="Minimum average score across competencies to pass.">
          <Slider 
            min={0} max={10} 
            value={7} 
            onChange={() => {}} 
          />
        </Field>
      </div>

      <div style={{ marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', backgroundColor: 'var(--surface)' }}>
        <h2 className="text-heading" style={{ marginBottom: '24px' }}>Competencies Rubric</h2>
        
        {allCompetencies.length === 0 ? (
          <p className="text-secondary text-body">
            No competencies defined yet. Add competencies under the "Scoring Input" section of your agents.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {allCompetencies.map(comp => (
              <div key={comp} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                <Field label={comp}>
                  <div className="flex gap-4 items-center">
                    <span className="text-body text-secondary" style={{ width: '80px' }}>Weight</span>
                    <Input type="number" defaultValue={1} style={{ maxWidth: '80px' }} />
                  </div>
                </Field>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
