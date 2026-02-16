import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { SlashCommandMenu, SlashCommand, SlashCommandMenuHandle } from './SlashCommandMenu'

interface InputBoxProps {
  onSend: (text: string) => void
  disabled: boolean
  customCommands: SlashCommand[]
  claudeCommands: SlashCommand[]
  onExecuteCommand: (command: SlashCommand, category: 'custom' | 'claude', args?: string) => void
}

export const InputBox: React.FC<InputBoxProps> = ({
  onSend,
  disabled,
  customCommands,
  claudeCommands,
  onExecuteCommand,
}) => {
  const [text, setText] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<SlashCommandMenuHandle>(null)

  // Autofocus on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  const handleSend = () => {
    if (!text.trim()) return

    onSend(text)
    setText('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleSelectCommand = (command: SlashCommand, category: 'custom' | 'claude') => {
    // Parse arguments from current text (everything after the command name)
    const parts = text.split(/\s+/)
    const args = parts.slice(1).join(' ')

    onExecuteCommand(command, category, args)
    setText('')
    setShowSlashMenu(false)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Menu navigation when visible
    if (showSlashMenu) {
      switch (e.key) {
        case 'Tab':
          e.preventDefault()
          menuRef.current?.toggleTab()
          return
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault()
          menuRef.current?.navigate(e.key === 'ArrowUp' ? -1 : 1)
          return
        case 'Enter':
          e.preventDefault()
          menuRef.current?.executeSelected()
          setText('')
          setShowSlashMenu(false)
          return
        case 'Escape':
          e.preventDefault()
          setShowSlashMenu(false)
          return
      }
    }

    // Normal Enter to send (when menu not visible)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setText(value)

    // Detect slash command
    if (value.startsWith('/')) {
      setShowSlashMenu(true)
      setSlashQuery(value.slice(1))
    } else {
      setShowSlashMenu(false)
      setSlashQuery('')
    }

    // Auto-grow textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  return (
    <div className="input-box" style={{ position: 'relative' }}>
      {showSlashMenu && (
        <SlashCommandMenu
          ref={menuRef}
          query={slashQuery}
          customCommands={customCommands}
          claudeCommands={claudeCommands}
          onSelectCommand={handleSelectCommand}
          onClose={() => setShowSlashMenu(false)}
        />
      )}
      <textarea
        ref={textareaRef}
        className="input-textarea"
        placeholder={
          disabled
            ? 'Type your next message... (will send after response)'
            : 'Type your message... (Enter to send, Shift+Enter for new line, / for commands)'
        }
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      <button
        className="send-button"
        onClick={handleSend}
        disabled={!text.trim()}
        title={disabled ? 'Message will be queued and sent after current response' : 'Send message'}
      >
        {disabled && text.trim() ? 'Queue' : 'Send'}
      </button>
    </div>
  )
}
