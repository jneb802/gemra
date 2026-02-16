import React, { useState, useRef, useEffect } from 'react'

type AgentMode = 'default' | 'acceptEdits' | 'plan'

interface AgentModeSelectorProps {
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
  disabled?: boolean
}

interface ModeOption {
  id: AgentMode
  name: string
  description: string
}

const MODE_OPTIONS: ModeOption[] = [
  { id: 'default', name: 'Default', description: 'Standard behavior' },
  { id: 'acceptEdits', name: 'Accept Edits', description: 'Auto-accept edits' },
  { id: 'plan', name: 'Plan', description: 'Planning only' },
]

export const AgentModeSelector: React.FC<AgentModeSelectorProps> = ({
  mode,
  onModeChange,
  disabled = false,
}) => {
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

  const handleModeSelect = (modeId: AgentMode) => {
    onModeChange(modeId)
    setIsOpen(false)
  }

  const currentMode = MODE_OPTIONS.find((m) => m.id === mode) || MODE_OPTIONS[0]

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
    >
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        title={`Agent mode: ${currentMode.name}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          backgroundColor: isOpen ? '#3a3a3a' : '#2a2a2a',
          border: '1px solid #3a3a3a',
          borderRadius: '4px',
          color: '#e0e0e0',
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'background-color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = '#3a3a3a'
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen && !disabled) {
            e.currentTarget.style.backgroundColor = '#2a2a2a'
          }
        }}
      >
        <span>{currentMode.name}</span>
        <span style={{ fontSize: '10px', marginLeft: '2px' }}>▾</span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '8px',
            backgroundColor: '#2a2a2a',
            border: '1px solid #3a3a3a',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            minWidth: '160px',
            zIndex: 1000,
          }}
        >
          <div style={{ padding: '4px' }}>
            {MODE_OPTIONS.map((modeOption) => (
              <button
                key={modeOption.id}
                onClick={() => handleModeSelect(modeOption.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: mode === modeOption.id ? '#3a3a3a' : 'transparent',
                  border: 'none',
                  borderRadius: '3px',
                  color: '#e0e0e0',
                  fontSize: '13px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#3a3a3a'
                }}
                onMouseLeave={(e) => {
                  if (mode !== modeOption.id) {
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
                  <span style={{ fontWeight: 500 }}>{modeOption.name}</span>
                  {mode === modeOption.id && (
                    <span style={{ fontSize: '12px', color: '#4a9eff' }}>✓</span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#888' }}>
                  {modeOption.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
