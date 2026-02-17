import React from 'react'

interface FormInputProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
  type?: string
}

export const FormInput: React.FC<FormInputProps> = ({
  id,
  label,
  value,
  onChange,
  onKeyDown,
  placeholder,
  autoFocus = false,
  disabled = false,
  type = 'text',
}) => {
  return (
    <div>
      <label
        htmlFor={id}
        style={{
          display: 'block',
          marginBottom: '6px',
          fontSize: '13px',
          color: 'var(--text-primary)',
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '8px 12px',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text-primary)',
          fontSize: '13px',
          outline: 'none',
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </div>
  )
}
