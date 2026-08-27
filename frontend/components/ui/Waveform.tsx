'use client';
import React, { useEffect, useState } from 'react';

interface WaveformProps {
  variant?: 'ambient' | 'active' | 'idle';
  color?: string;
  className?: string;
}

const BAR_COUNT = 40;
const INITIAL_BARS = Array.from({ length: BAR_COUNT }, () => 0.5);

export function Waveform({ variant = 'ambient', color = 'var(--text-primary)', className = '' }: WaveformProps) {
  const [bars, setBars] = useState<number[]>(INITIAL_BARS);

  useEffect(() => {
    // Randomize only after mount, so server and client render the same initial markup.
    setBars(Array.from({ length: BAR_COUNT }, () => Math.random()));

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches || variant === 'idle') {
      setBars(Array.from({ length: BAR_COUNT }, () => 0.2));
      return;
    }

    const interval = setInterval(() => {
      setBars(prev => prev.map(() => Math.random()));
    }, variant === 'active' ? 150 : 800); // ambient is slow, active is fast

    return () => clearInterval(interval);
  }, [variant]);

  const opacity = variant === 'ambient' ? 0.05 : variant === 'idle' ? 0.3 : 0.8;
  const heightMultiplier = variant === 'ambient' ? 100 : variant === 'idle' ? 20 : 40;

  return (
    <div
      className={`waveform flex items-center justify-center gap-[2px] ${className}`}
      style={{ opacity }}
    >
      {bars.map((val, idx) => (
        <div
          key={idx}
          style={{
            width: '2px',
            height: `${Math.max(10, val * heightMultiplier)}px`,
            backgroundColor: color,
            transition: 'height 200ms ease',
            borderRadius: '1px'
          }}
        />
      ))}
    </div>
  );
}
