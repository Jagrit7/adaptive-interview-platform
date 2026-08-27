import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  const baseStyles: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: '8px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--text-primary)',
      color: 'var(--bg)',
    },
    secondary: {
      backgroundColor: 'var(--surface-raised)',
      border: '1px solid var(--border-strong)',
      color: 'var(--text-primary)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-secondary)',
    }
  };

  return (
    <button
      className={`button-${variant} ${className}`}
      style={{ ...baseStyles, ...variants[variant], ...props.style }}
      {...props}
    >
      <style>{`
        .button-primary:hover { opacity: 0.9; }
        .button-secondary:hover { background-color: var(--border-strong); }
        .button-ghost:hover { color: var(--text-primary); }
      `}</style>
      {children}
    </button>
  );
}
