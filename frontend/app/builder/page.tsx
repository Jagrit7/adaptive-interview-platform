'use client';

import React from 'react';
import { useBuilderStore } from '@/store/builderStore';
import { EditableText } from '@/components/ui/EditableText';
import { Button } from '@/components/ui/Button';
import { LeftRail } from './LeftRail';
import { AgentConfigForm } from './AgentConfigForm';
import { ScorerConfigForm } from './ScorerConfigForm';
import { RoleAccentProvider } from '@/components/ui/RoleAccentProvider';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/ui/AuthGate';

export default function BuilderPage() {
  // Bounces signed-out visitors to /login before any builder state renders.
  // UX only - RLS in supabase/schema.sql is the real boundary.
  return (
    <AuthGate>
      <BuilderPageInner />
    </AuthGate>
  );
}

function BuilderPageInner() {
  const { projectName, setProjectName, selectedAgentId, agents, saveProject, isSaved,
          isSaving, saveError } = useBuilderStore();
  const router = useRouter();
  
  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Top Bar */}
      <header 
        className="flex items-center justify-between"
        style={{ 
          height: '64px', 
          padding: '0 24px', 
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg)'
        }}
      >
        <div style={{ maxWidth: '300px', width: '100%' }}>
          <EditableText 
            value={projectName} 
            onChange={setProjectName} 
            placeholder="Untitled panel" 
          />
        </div>
        <div className="flex items-center gap-4">
          {saveError && (
            <span className="text-caption" style={{ color: 'var(--accent-rose)' }} title={saveError}>
              Not saved
            </span>
          )}
          {!saveError && isSaving && <span className="text-caption">Saving...</span>}
          {!saveError && !isSaving && !isSaved && <span className="text-caption">Unsaved changes</span>}
          <Button onClick={saveProject} variant="primary">
            Save Panel
          </Button>
          <Button 
            variant="secondary" 
            disabled={agents.length === 0}
            onClick={() => router.push('/interview-room')}
            title={agents.length === 0 ? "Add an agent first" : "Start the interview panel"}
          >
            Start Panel
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Rail */}
        <LeftRail />

        {/* Main Panel */}
        <main 
          className="flex-1 overflow-y-auto"
          style={{ padding: '32px 48px', backgroundColor: 'var(--bg)' }}
        >
          {selectedAgentId === 'scorer' ? (
            <ScorerConfigForm />
          ) : selectedAgent ? (
            <RoleAccentProvider color={selectedAgent.identity.color} className="w-full h-full max-w-none flex flex-col">
              <AgentConfigForm key={selectedAgent.id} agent={selectedAgent} />
            </RoleAccentProvider>
          ) : (
            <div className="flex items-center justify-center h-full text-secondary">
              <p>Add your first agent to get started</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
