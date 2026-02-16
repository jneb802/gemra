import React from 'react'
import type { InputMode } from '../../types/inputMode'
import { BashIcon } from '../icons/BashIcon'
import { GemIcon } from '../icons/GemIcon'

interface IconModeToggleProps {
  mode: InputMode
  onModeChange: (mode: InputMode) => void
  disabled?: boolean
}

export const IconModeToggle: React.FC<IconModeToggleProps> = ({
  mode,
  onModeChange,
  disabled = false,
}) => {
  const handleCommandClick = () => {
    if (!disabled) {
      onModeChange('command')
    }
  }

  const handleAiClick = () => {
    if (!disabled) {
      // If already in AI mode, toggle to Auto mode
      if (mode === 'ai') {
        onModeChange('auto')
      } else {
        onModeChange('ai')
      }
    }
  }

  const isCommand = mode === 'command'
  const isAi = mode === 'ai' || mode === 'auto'
  const isAuto = mode === 'auto'

  return (
    <div
      style={{
        display: 'flex',
        gap: '4px',
      }}
    >
      {/* Command button */}
      <button
        onClick={handleCommandClick}
        disabled={disabled}
        title="Command mode - Execute as shell command"
        style={{
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isCommand ? '#3a3a3a' : 'transparent',
          border: '1px solid #3a3a3a',
          borderRadius: '4px',
          color: '#e0e0e0',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'background-color 0.15s ease',
          padding: 0,
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = '#3a3a3a'
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !isCommand) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <BashIcon size={18} color="#e0e0e0" />
      </button>

      {/* AI button */}
      <button
        onClick={handleAiClick}
        disabled={disabled}
        title={
          isAuto
            ? 'Auto mode - Detects command vs AI (click to switch to AI mode)'
            : 'AI mode - Send to Claude (click to switch to Auto mode)'
        }
        style={{
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isAi ? (isAuto ? 'transparent' : '#d4a02e') : 'transparent',
          border: '1px solid #3a3a3a',
          borderRadius: '4px',
          color: isAi && !isAuto ? '#1a1a1a' : '#d4a02e',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.15s ease',
          padding: 0,
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            if (isAuto) {
              e.currentTarget.style.backgroundColor = '#3a3a3a'
              e.currentTarget.style.color = '#d4a02e'
            } else if (isAi) {
              e.currentTarget.style.backgroundColor = '#e5b13e'
            }
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            if (isAuto) {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#d4a02e'
            } else if (isAi) {
              e.currentTarget.style.backgroundColor = '#d4a02e'
              e.currentTarget.style.color = '#1a1a1a'
            } else {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#d4a02e'
            }
          }
        }}
      >
        <GemIcon size={18} color="currentColor" />
      </button>
    </div>
  )
}
