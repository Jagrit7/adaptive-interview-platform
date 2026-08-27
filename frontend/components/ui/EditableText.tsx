import React, { useState, useRef, useEffect } from 'react';

interface EditableTextProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  isHero?: boolean;
}

export function EditableText({ value, onChange, placeholder = 'Untitled', isHero = false }: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    onChange(tempValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setTempValue(value);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          fontFamily: isHero ? 'var(--font-display)' : 'var(--font-body)',
          fontSize: isHero ? '40px' : '16px',
          color: 'var(--text-primary)',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          width: '100%',
          caretColor: 'var(--text-primary)'
        }}
      />
    );
  }

  return (
    <div
      onClick={() => {
        setTempValue(value);
        setIsEditing(true);
      }}
      style={{
        fontFamily: isHero ? 'var(--font-display)' : 'var(--font-body)',
        fontSize: isHero ? '40px' : '16px',
        color: value ? 'var(--text-primary)' : 'var(--text-muted)',
        cursor: 'text',
        display: 'inline-block',
        width: '100%'
      }}
    >
      {value || placeholder}
      {isHero && <span className="cursor-blink">|</span>}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .cursor-blink {
          display: inline-block;
          animation: blink 1s step-end infinite;
          margin-left: 4px;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
