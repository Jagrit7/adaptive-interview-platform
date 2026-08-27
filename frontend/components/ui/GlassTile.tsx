import React from 'react';

interface GlassTileProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function GlassTile({ children, style, className = '', ...props }: GlassTileProps) {
  return (
    <div
      className={`glass-tile ${className}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '16px',
        ...style
      }}
      {...props}
    >
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          backgroundColor: 'var(--glass-highlight)',
          zIndex: 1
        }}
      />
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}
