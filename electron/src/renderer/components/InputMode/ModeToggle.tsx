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
    <div ref={dropdownRef} className="mode-toggle-container">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        title={`Input mode: ${MODE_LABELS[mode]}`}
        className={`mode-toggle-button ${isOpen ? 'open' : ''}`}
      >
        <span className="mode-toggle-icon">{MODE_ICONS[mode]}</span>
        <span>{MODE_LABELS[mode]}</span>
        <span className="mode-toggle-arrow">▾</span>
      </button>

      {isOpen && (
        <div className="mode-toggle-dropdown">
          <div className="mode-toggle-options">
            {(['auto', 'command', 'ai'] as InputMode[]).map((modeOption) => (
              <button
                key={modeOption}
                onClick={() => handleModeSelect(modeOption)}
                className={`mode-toggle-option ${mode === modeOption ? 'selected' : ''}`}
              >
                <span className="mode-toggle-option-icon">{MODE_ICONS[modeOption]}</span>
                <span className="mode-toggle-option-label">{MODE_LABELS[modeOption]}</span>
                {mode === modeOption && (
                  <span className="mode-toggle-option-check">✓</span>
                )}
              </button>
            ))}
          </div>

          <div className="mode-toggle-hint">
            {mode === 'auto' && 'Detects command vs AI'}
            {mode === 'command' && 'Execute as shell command'}
            {mode === 'ai' && 'Send to Claude'}
          </div>
        </div>
      )}
    </div>
  )
}
