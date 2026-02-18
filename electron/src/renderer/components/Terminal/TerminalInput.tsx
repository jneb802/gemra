import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { StatusChips } from '../claude/StatusChips'

const TERMINAL_COMMANDS = [
  { name: 'claude', description: 'Open Claude chat for this directory' },
]

interface TerminalInputProps {
  terminalId: string
  workingDir: string
  gitBranch?: string
  gitStats?: { filesChanged: number; insertions: number; deletions: number }
  onSendCommand: (command: string) => void
  onSlashCommand?: (name: string) => void
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
  onSlashCommand,
  disabled = false,
}: TerminalInputProps) {
  const [text, setText] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filtered = TERMINAL_COMMANDS.filter(cmd =>
    cmd.name.startsWith(slashQuery.toLowerCase())
  )

  const executeSlashCommand = (name: string) => {
    onSlashCommand?.(name)
    setText('')
    setShowSlashMenu(false)
  }

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

    // Intercept slash commands
    if (text.startsWith('/')) {
      const name = text.slice(1).trim().split(/\s+/)[0]
      executeSlashCommand(name)
      return
    }

    onSendCommand(text)
    addToHistory(text)
    setText('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash menu navigation takes priority
    if (showSlashMenu) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(0, i - 1))
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(filtered.length - 1, i + 1))
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowSlashMenu(false)
        return
      }
      if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault()
        executeSlashCommand(filtered[selectedIndex].name)
        return
      }
    }

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

    if (value.startsWith('/')) {
      setShowSlashMenu(true)
      setSlashQuery(value.slice(1))
      setSelectedIndex(0)
    } else {
      setShowSlashMenu(false)
    }

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

      {/* Input area with slash menu */}
      <div style={{ position: 'relative' }}>
        {showSlashMenu && filtered.length > 0 && (
          <div className="terminal-slash-menu">
            {filtered.map((cmd, i) => (
              <div
                key={cmd.name}
                className={`terminal-slash-item${i === selectedIndex ? ' selected' : ''}`}
                onClick={() => executeSlashCommand(cmd.name)}
              >
                <span className="slash-item-name">/{cmd.name}</span>
                <span className="slash-item-desc">{cmd.description}</span>
              </div>
            ))}
          </div>
        )}
        <div className="terminal-input-row">
          <div className="terminal-input-prompt">$</div>
          <textarea
            ref={textareaRef}
            className="terminal-input-textarea"
            placeholder={
              disabled
                ? 'Waiting for command to complete...'
                : 'Type a command... (↑/↓ for history, / for commands, Enter to run)'
            }
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
          />
        </div>
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
