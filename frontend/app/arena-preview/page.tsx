'use client';

/**
 * Temporary preview route so the arena screen can be held against the design
 * photos without touching InterviewRoomLive's session logic. Delete once the
 * real room renders <ArenaRoom />.
 */

import { useState } from 'react';
import { ArenaRoom, type Panelist } from '@/components/arena/ArenaRoom';

const PANEL: Panelist[] = [
  { id: 'a', name: 'Aura-9',  role: 'Principal AI evaluator', speaking: true },
  { id: 'b', name: 'Marcus',  role: 'Backend systems' },
  { id: 'c', name: 'Sarah',   role: 'Hiring manager' },
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
      question="Implement merge sort for an array of integers."
      questionDetails={{ id: 'preview', prompt: 'Implement merge sort for an array of integers.', tags: ['Coding', 'Medium'], difficulty: 5, kind: 'coding' }}
      panelists={PANEL}
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
