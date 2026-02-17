import React, { useState, useRef, useEffect } from 'react'
import { Tooltip } from '../common/Tooltip'

interface ModelSelectorProps {
  model: string
  onModelChange: (model: string) => void
  disabled?: boolean
}

interface ModelOption {
  id: string
  name: string
  description: string
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'opus', name: 'Opus 4.6', description: 'Most capable, slower' },
  { id: 'sonnet', name: 'Sonnet 4.5', description: 'Balanced speed & quality' },
  { id: 'haiku', name: 'Haiku 4.5', description: 'Fastest, most efficient' },
]

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  model,
  onModelChange,
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

  const handleModelSelect = (modelId: string) => {
    onModelChange(modelId)
    setIsOpen(false)
  }

  const currentModel = MODEL_OPTIONS.find((m) => m.id === model) || MODEL_OPTIONS[1]

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
    >
      <Tooltip content={`Model: ${currentModel.name}\n${currentModel.description}\nClick to change model`}>
        <button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
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
        <span>{currentModel.name}</span>
        <span style={{ fontSize: '10px', marginLeft: '2px' }}>▾</span>
      </button>
      </Tooltip>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: '8px',
            backgroundColor: '#2a2a2a',
            border: '1px solid #3a3a3a',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            minWidth: '180px',
            zIndex: 1000,
          }}
        >
          <div style={{ padding: '4px' }}>
            {MODEL_OPTIONS.map((modelOption) => (
              <button
                key={modelOption.id}
                onClick={() => handleModelSelect(modelOption.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: model === modelOption.id ? '#3a3a3a' : 'transparent',
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
                  if (model !== modelOption.id) {
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
                  <span style={{ fontWeight: 500 }}>{modelOption.name}</span>
                  {model === modelOption.id && (
                    <span style={{ fontSize: '12px', color: '#4a9eff' }}>✓</span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#888' }}>
                  {modelOption.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
