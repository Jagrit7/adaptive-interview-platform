import React from 'react';

interface RoleAccentProviderProps {
  color: string;
  children: React.ReactNode;
  className?: string;
}

export function RoleAccentProvider({ color, children, className = '' }: RoleAccentProviderProps) {
  return (
    <div 
      className={className} 
      style={{ 
        '--role-accent': color,
        '--text-primary': color, // Optional: if you want the text to take the color in specific contexts
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
