import React, { useState, useRef, useCallback, useEffect } from 'react'
import type { QuestPrompt as QuestPromptType, QuestOption } from '../../../shared/types'
import { MenuItem } from '../common/MenuItem'

interface QuestPromptProps {
  questPrompt: QuestPromptType
  onRespond: (response: string | string[]) => void
  isLoading?: boolean
}

export const QuestPrompt: React.FC<QuestPromptProps> = ({
  questPrompt,
  onRespond,
  isLoading
}) => {
  const [textInput, setTextInput] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [multiSelectValues, setMultiSelectValues] = useState<Set<string>>(new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea on mount for text input
  useEffect(() => {
    if (questPrompt.answerType === 'text' && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [questPrompt.answerType])

  const handleTextSubmit = useCallback(() => {
    if (textInput.trim()) {
      onRespond(textInput.trim())
      setTextInput('')
    }
  }, [textInput, onRespond])

  const handleSelectOption = useCallback((value: string) => {
    if (questPrompt.multiSelect) {
      // Toggle selection in multiselect mode
      setMultiSelectValues((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(value)) {
          newSet.delete(value)
        } else {
          newSet.add(value)
        }
        return newSet
      })
    } else {
      // Single select - submit immediately
      onRespond(value)
    }
  }, [questPrompt.multiSelect, onRespond])

  const handleMultiSelectSubmit = useCallback(() => {
    if (multiSelectValues.size > 0 || !questPrompt.required) {
      onRespond(Array.from(multiSelectValues))
    }
  }, [multiSelectValues, questPrompt.required, onRespond])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (questPrompt.answerType === 'select' || questPrompt.answerType === 'multiselect') {
      const optionsCount = questPrompt.options?.length || 0

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % optionsCount)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + optionsCount) % optionsCount)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const selectedOption = questPrompt.options?.[selectedIndex]
        if (selectedOption) {
          if (questPrompt.multiSelect) {
            handleSelectOption(selectedOption.value)
          } else {
            onRespond(selectedOption.value)
          }
        }
      } else if (e.key === ' ' && questPrompt.multiSelect) {
        // Space to toggle in multiselect
        e.preventDefault()
        const selectedOption = questPrompt.options?.[selectedIndex]
        if (selectedOption) {
          handleSelectOption(selectedOption.value)
        }
      }
    }
  }, [questPrompt, selectedIndex, onRespond, handleSelectOption])

  // Auto-focus the component for keyboard navigation
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (questPrompt.answerType !== 'text' && containerRef.current) {
      containerRef.current.focus()
    }
  }, [questPrompt.answerType])

  return (
    <div
      ref={containerRef}
      className="quest-prompt"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Question header */}
      <div className="quest-header">
        <span className="quest-badge">{questPrompt.header}</span>
      </div>

      <div className="quest-question">{questPrompt.question}</div>

      {questPrompt.description && (
        <div className="quest-description">{questPrompt.description}</div>
      )}

      {/* Text input */}
      {questPrompt.answerType === 'text' && (
        <div className="quest-input-container">
          <textarea
            ref={textareaRef}
            className="quest-textarea"
            placeholder="Enter your response..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleTextSubmit()
              }
            }}
            disabled={isLoading}
          />
          <div className="quest-input-hint">
            {questPrompt.required && <span className="quest-required">Required</span>}
            <span>Cmd+Enter to submit</span>
          </div>
          <button
            className="quest-submit-btn"
            onClick={handleTextSubmit}
            disabled={isLoading || (questPrompt.required && !textInput.trim())}
          >
            {isLoading ? 'Sending...' : 'Submit'}
          </button>
        </div>
      )}

      {/* Select/Multiselect options */}
      {(questPrompt.answerType === 'select' || questPrompt.answerType === 'multiselect') && (
        <>
          <div className="quest-options-list">
            {questPrompt.options?.map((option, index) => {
              const isSelected = questPrompt.multiSelect
                ? multiSelectValues.has(option.value)
                : index === selectedIndex

              const prefix = questPrompt.multiSelect
                ? (multiSelectValues.has(option.value) ? '☑ ' : '☐ ')
                : ''

              return (
                <MenuItem
                  key={option.value}
                  label={prefix + option.label}
                  description={option.description || ''}
                  onClick={() => handleSelectOption(option.value)}
                  selected={index === selectedIndex}
                />
              )
            })}
          </div>

          <div className="quest-options-hint">
            {questPrompt.multiSelect ? (
              <>
                <span>↑↓: navigate</span>
                <span>Space: toggle</span>
                <span>Enter: toggle</span>
              </>
            ) : (
              <>
                <span>↑↓: navigate</span>
                <span>Enter: select</span>
              </>
            )}
          </div>

          {questPrompt.multiSelect && (
            <button
              className="quest-submit-btn"
              onClick={handleMultiSelectSubmit}
              disabled={isLoading || (questPrompt.required && multiSelectValues.size === 0)}
            >
              {isLoading ? 'Sending...' : `Submit${multiSelectValues.size > 0 ? ` (${multiSelectValues.size})` : ''}`}
            </button>
          )}
        </>
      )}

      {/* Confirm buttons */}
      {questPrompt.answerType === 'confirm' && (
        <div className="quest-buttons">
          <button
            className="quest-btn quest-btn-primary"
            onClick={() => onRespond('yes')}
            disabled={isLoading}
          >
            Yes
          </button>
          <button
            className="quest-btn quest-btn-secondary"
            onClick={() => onRespond('no')}
            disabled={isLoading}
          >
            No
          </button>
        </div>
      )}
    </div>
  )
}
