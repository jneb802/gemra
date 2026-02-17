import React, { useState, useRef, useEffect } from 'react'
import { Tooltip } from './Tooltip'

export interface Option {
  id: string
  name: string
  description: string
}

interface OptionSelectorProps<T extends string> {
  value: T
  options: Option[]
  onChange: (value: T) => void
  label: string
  tooltipTemplate?: (option: Option) => string
  align?: 'left' | 'right'
  disabled?: boolean
}

export function OptionSelector<T extends string>({
  value,
  options,
  onChange,
  label,
  tooltipTemplate,
  align = 'right',
  disabled = false,
}: OptionSelectorProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (optionId: string) => {
    onChange(optionId as T)
    setIsOpen(false)
  }

  const currentOption = options.find((o) => o.id === value) || options[0]

  const defaultTooltip = `${label}: ${currentOption.name}\n${currentOption.description}\nClick to change ${label.toLowerCase()}`
  const tooltipContent = tooltipTemplate
    ? tooltipTemplate(currentOption)
    : defaultTooltip

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
    >
      <Tooltip content={tooltipContent}>
        <button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            height: '32px',
            padding: '0 8px',
            backgroundColor: isOpen ? 'var(--bg-active)' : 'var(--bg-user-message)',
            border: '1px solid var(--bg-active)',
            borderRadius: '4px',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.backgroundColor = 'var(--bg-active)'
            }
          }}
          onMouseLeave={(e) => {
            if (!isOpen && !disabled) {
              e.currentTarget.style.backgroundColor = 'var(--bg-user-message)'
            }
          }}
        >
          <span>{currentOption.name}</span>
          <span style={{ fontSize: '10px', marginLeft: '2px' }}>▾</span>
        </button>
      </Tooltip>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            [align]: 0,
            marginBottom: '8px',
            backgroundColor: 'var(--bg-user-message)',
            border: '1px solid var(--bg-active)',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            minWidth: '160px',
            zIndex: 1000,
          }}
        >
          <div style={{ padding: '4px' }}>
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: value === option.id ? 'var(--bg-active)' : 'transparent',
                  border: 'none',
                  borderRadius: '3px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-active)'
                }}
                onMouseLeave={(e) => {
                  if (value !== option.id) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{option.name}</span>
                  {value === option.id && (
                    <span style={{ fontSize: '12px', color: '#4a9eff' }}>✓</span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {option.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
