import React, { useState, useRef, useEffect } from 'react'
import type { InputMode } from '../../types/inputMode'
import { MODE_LABELS, MODE_ICONS } from '../../types/inputMode'

interface ModeToggleProps {
  mode: InputMode
  onModeChange: (mode: InputMode) => void
  disabled?: boolean
}

export const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onModeChange, disabled = false }) => {
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

  const handleModeSelect = (selectedMode: InputMode) => {
    onModeChange(selectedMode)
    setIsOpen(false)
  }

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
    >
      <button
        className="mode-toggle-button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        title={`Input mode: ${MODE_LABELS[mode]}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          backgroundColor: isOpen ? '#3a3a3a' : '#2a2a2a',
          border: '1px solid #3a3a3a',
          borderRadius: '4px',
          color: '#e0e0e0',
          fontSize: '13px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'background-color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = '#3a3a3a'
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.backgroundColor = '#2a2a2a'
          }
        }}
      >
        <span style={{ fontSize: '14px' }}>{MODE_ICONS[mode]}</span>
        <span>{MODE_LABELS[mode]}</span>
        <span style={{ fontSize: '10px', marginLeft: '2px' }}>▾</span>
      </button>

      {isOpen && (
        <div
          className="mode-dropdown"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            backgroundColor: '#2a2a2a',
            border: '1px solid #3a3a3a',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            minWidth: '140px',
            zIndex: 1000,
          }}
        >
          <div style={{ padding: '4px' }}>
            {(['auto', 'command', 'ai'] as InputMode[]).map((modeOption) => (
              <button
                key={modeOption}
                className="mode-option"
                onClick={() => handleModeSelect(modeOption)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '6px 10px',
                  backgroundColor: mode === modeOption ? '#3a3a3a' : 'transparent',
                  border: 'none',
                  borderRadius: '3px',
                  color: '#e0e0e0',
                  fontSize: '13px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#3a3a3a'
                }}
                onMouseLeave={(e) => {
                  if (mode !== modeOption) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                <span style={{ fontSize: '16px' }}>{MODE_ICONS[modeOption]}</span>
                <span style={{ flex: 1 }}>{MODE_LABELS[modeOption]}</span>
                {mode === modeOption && (
                  <span style={{ fontSize: '12px', color: '#4a9eff' }}>✓</span>
                )}
              </button>
            ))}
          </div>

          <div
            style={{
              padding: '6px 10px',
              borderTop: '1px solid #3a3a3a',
              fontSize: '11px',
              color: '#888',
            }}
          >
            {mode === 'auto' && 'Detects command vs AI'}
            {mode === 'command' && 'Execute as shell command'}
            {mode === 'ai' && 'Send to Claude'}
          </div>
        </div>
      )}
    </div>
  )
}
