import React from 'react';
import { GlassTile } from './GlassTile';
import { Waveform } from './Waveform';

export function GlassDashboardPreview() {
  const stats = [
    { label: "4 interviewer roles", value: "Multi-agent panel" },
    { label: "Adaptive difficulty", value: "Dynamic scaling" },
    { label: "Live voice, Agora", value: "Real-time audio" },
    { label: "Evidence-based scoring", value: "Objective rubric" }
  ];

  const agents = [
    { name: "Technical", role: "Senior Software Engineer", description: "Focus on system design, data structures, and algorithms.", color: "var(--accent-indigo)" },
    { name: "Hiring Manager", role: "Engineering Director", description: "Focus on team fit, long-term potential, and leadership.", color: "var(--accent-teal)" },
    { name: "Behavioural", role: "HR Representative", description: "Conducts behavioral interview using the STAR method.", color: "var(--accent-violet)" }
  ];

  return (
    <div style={{ position: 'relative', width: '100%', marginTop: '32px', marginBottom: '32px' }}>
      {/* Glow Blob */}
      <div 
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80%',
          height: '120%',
          background: 'radial-gradient(ellipse at center, rgba(110, 86, 207, 0.4) 0%, rgba(232, 163, 61, 0.3) 50%, rgba(45, 212, 191, 0.1) 100%)',
          filter: 'blur(80px)',
          opacity: 0.35,
          zIndex: 0,
          borderRadius: '50%',
          pointerEvents: 'none'
        }}
      />

      {/* Glass Panel Container */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Stat row */}
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
            gap: '16px' 
          }}
        >
          {stats.map((stat, i) => (
            <GlassTile key={i} style={{ padding: '12px 16px' }}>
              <span style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>{stat.label}</span>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>{stat.value}</span>
            </GlassTile>
          ))}
        </div>

        {/* Agent Cards row */}
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '16px' 
          }}
        >
          {agents.map((agent, i) => (
            <GlassTile key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: agent.color }} />
                <span style={{ fontWeight: 600, fontSize: '15px' }}>{agent.name}</span>
              </div>
              <span style={{ fontSize: '13px', opacity: 0.7, marginBottom: '12px', display: 'block' }}>{agent.role}</span>
              <p style={{ fontSize: '13px', opacity: 0.6, lineHeight: 1.4, flexGrow: 1 }}>{agent.description}</p>
              <div style={{ marginTop: '16px', height: '24px', opacity: 0.5, overflow: 'hidden' }}>
                {/* Static waveform glyph, replacing the animated one since this is just a preview */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '100%' }}>
                  {[12, 24, 16, 8, 14, 20, 10].map((h, j) => (
                    <div key={j} style={{ width: '3px', height: `${h}px`, backgroundColor: agent.color, borderRadius: '2px' }} />
                  ))}
                </div>
              </div>
            </GlassTile>
          ))}
        </div>

      </div>
    </div>
  );
}
