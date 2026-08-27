import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverable?: boolean;
}

export function Card({ children, hoverable, className = '', ...props }: CardProps) {
  return (
    <div
      className={`card ${hoverable ? 'card-hoverable' : ''} ${className}`}
      {...props}
      style={{
        backgroundColor: 'var(--surface)',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        padding: '24px',
        transition: 'all 200ms ease',
        cursor: hoverable ? 'pointer' : 'default',
        ...props.style
      }}
    >
      <style>{`
        .card-hoverable:hover {
          transform: translateY(-2px);
          border-color: var(--border-strong);
        }
      `}</style>
      {children}
    </div>
  );
}
