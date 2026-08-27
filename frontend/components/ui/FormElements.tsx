import React from 'react';

// --- Field Wrapper ---
export function Field({ label, description, children, error }: { label: string, description?: string, children: React.ReactNode, error?: string }) {
  return (
    <div className="flex flex-col gap-2" style={{ marginBottom: '24px' }}>
      <label style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{label}</label>
      {description && <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{description}</span>}
      {children}
      {error && <span style={{ fontSize: '12px', color: 'var(--accent-rose)' }}>{error}</span>}
    </div>
  );
}

// --- Input ---
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        padding: '10px 12px',
        backgroundColor: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        color: 'var(--text-primary)',
        width: '100%',
        ...props.style
      }}
    />
  );
}

// --- Textarea ---
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        padding: '12px',
        backgroundColor: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        color: 'var(--text-primary)',
        width: '100%',
        minHeight: '100px',
        resize: 'vertical',
        ...props.style
      }}
    />
  );
}

// --- Select ---
export function Select({ options, value, onChange, ...props }: { options: { label: string, value: string }[], value: string, onChange: (val: string) => void } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'>) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
      style={{
        padding: '10px 12px',
        backgroundColor: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        color: 'var(--text-primary)',
        width: '100%',
        appearance: 'none',
        ...props.style
      }}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// --- Switch ---
export function Switch({ checked, onChange, label }: { checked: boolean, onChange: (checked: boolean) => void, label?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
      <div style={{
        width: '40px',
        height: '24px',
        backgroundColor: checked ? 'var(--text-primary)' : 'var(--border-strong)',
        borderRadius: '12px',
        position: 'relative',
        transition: 'background-color 200ms'
      }}>
        <div style={{
          width: '18px',
          height: '18px',
          backgroundColor: checked ? 'var(--bg)' : 'var(--text-secondary)',
          borderRadius: '50%',
          position: 'absolute',
          top: '3px',
          left: checked ? '19px' : '3px',
          transition: 'left 200ms, background-color 200ms'
        }} />
      </div>
      {label && <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{label}</span>}
    </label>
  );
}

// --- Slider ---
export function Slider({ value, min, max, onChange, ...props }: { value: number, min: number, max: number, onChange: (val: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'|'onChange'|'min'|'max'>) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--text-primary)' }}
        {...props}
      />
      <span style={{ minWidth: '24px', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// --- Chips ---
export function Chips({ options, value, onChange }: { options: { label: string, value: string }[], value: string[], onChange: (val: string[]) => void }) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter(v => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {options.map(opt => {
        const isSelected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '16px',
              border: `1px solid ${isSelected ? 'var(--text-primary)' : 'var(--border)'}`,
              backgroundColor: isSelected ? 'var(--text-primary)' : 'transparent',
              color: isSelected ? 'var(--bg)' : 'var(--text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 150ms'
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
