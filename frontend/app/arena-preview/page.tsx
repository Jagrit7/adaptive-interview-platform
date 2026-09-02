'use client';

/**
 * Temporary preview route so the arena screen can be held against the design
 * photos without touching InterviewRoomLive's session logic. Delete once the
 * real room renders <ArenaRoom />.
 */

import { useState } from 'react';
import { ArenaRoom, type Panelist, type TranscriptLine } from '@/components/arena/ArenaRoom';

const PANEL: Panelist[] = [
  { id: 'a', name: 'Aura-9',  role: 'Principal AI evaluator', speaking: true },
  { id: 'b', name: 'Marcus',  role: 'Backend systems' },
  { id: 'c', name: 'Sarah',   role: 'Hiring manager' },
];

const TRANSCRIPT: TranscriptLine[] = [
  { id: '1', who: 'agent', name: 'Aura-9',
    text: 'Walk me through how you would design a URL shortener.' },
  { id: '2', who: 'candidate', name: 'You',
    text: 'I would base62-encode an auto-increment ID rather than hashing, so collisions never arise.' },
  { id: '3', who: 'agent', name: 'Aura-9',
    text: 'Good. What breaks first at a hundred thousand redirects per second?' },
];

export default function ArenaPreview() {
  const [code, setCode] = useState('def encode(n: int) -> str:\n    ');
  const [language, setLanguage] = useState('Python');
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);

  return (
    <ArenaRoom
      roundName="Technical round"
      elapsed="12:45"
      questionNumber={3}
      questionTotal={8}
      question="Can you explain the time complexity of merge sort, and why it is O(n log n) in all cases?"
      panelists={PANEL}
      transcript={TRANSCRIPT}
      agentState="listening"
      code={code}
      onCodeChange={setCode}
      language={language}
      onLanguageChange={setLanguage}
      micOn={micOn}
      onToggleMic={() => setMicOn((v) => !v)}
      cameraOn={cameraOn}
      onToggleCamera={() => setCameraOn((v) => !v)}
      onEnd={() => alert('End interview')}
      coding
    />
  );
}
