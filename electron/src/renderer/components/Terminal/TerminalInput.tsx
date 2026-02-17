import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { StatusChips } from '../claude/StatusChips'

interface TerminalInputProps {
  terminalId: string
  workingDir: string
  gitBranch?: string
  gitStats?: { filesChanged: number; insertions: number; deletions: number }
  onSendCommand: (command: string) => void
  disabled?: boolean
}

/**
 * TerminalInput - Unified input box for terminal commands
 *
 * Uses the same visual style as chat input but tailored for shell commands
 */
export function TerminalInput({
  terminalId,
  workingDir,
  gitBranch = '',
  gitStats = { filesChanged: 0, insertions: 0, deletions: 0 },
  onSendCommand,
  disabled = false,
}: TerminalInputProps) {
  const [text, setText] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Autofocus on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  // Load command history from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`terminal-history-${terminalId}`)
    if (stored) {
      try {
        setCommandHistory(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to load command history:', e)
      }
    }
  }, [terminalId])

  // Save command to history
  const addToHistory = (command: string) => {
    if (!command.trim()) return

    const newHistory = [command, ...commandHistory.filter(c => c !== command)].slice(0, 100)
    setCommandHistory(newHistory)
    localStorage.setItem(`terminal-history-${terminalId}`, JSON.stringify(newHistory))
    setHistoryIndex(-1)
  }

  const handleSend = () => {
    if (!text.trim() || disabled) return

    onSendCommand(text)
    addToHistory(text)
    setText('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
      return
    }

    // Shift+Enter for newline (allow default behavior)
    if (e.key === 'Enter' && e.shiftKey) {
      return
    }

    // Arrow Up - Previous command in history
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setText(commandHistory[newIndex])
      }
      return
    }

    // Arrow Down - Next command in history
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setText(commandHistory[newIndex])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setText('')
      }
      return
    }

    // Ctrl+C - Clear input
    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault()
      setText('')
      setHistoryIndex(-1)
      return
    }

    // Ctrl+L - Clear screen (send clear command)
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      onSendCommand('clear')
      return
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setText(value)

    // Auto-grow textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  return (
    <div className="terminal-input">
      {/* Status chips (same as chat) */}
      <StatusChips
        workingDir={workingDir}
        gitBranch={gitBranch}
        gitStats={gitStats}
        containerStatus="disabled"
        onBranchClick={() => {}}
        onContainerToggle={() => {}}
      />

      {/* Input area */}
      <div className="terminal-input-row">
        <div className="terminal-input-prompt">$</div>
        <textarea
          ref={textareaRef}
          className="terminal-input-textarea"
          placeholder={
            disabled
              ? 'Waiting for command to complete...'
              : 'Type a command... (↑/↓ for history, Enter to run)'
          }
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
        />
      </div>

      {/* Hints */}
      <div className="terminal-input-hints">
        <span className="hint">↑/↓ History</span>
        <span className="hint-separator">•</span>
        <span className="hint">Enter to run</span>
        <span className="hint-separator">•</span>
        <span className="hint">Shift+Enter for newline</span>
        <span className="hint-separator">•</span>
        <span className="hint">Ctrl+C to clear</span>
      </div>
    </div>
  )
}
