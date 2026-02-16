import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { SlashCommandMenu, SlashCommand, SlashCommandMenuHandle } from './SlashCommandMenu'

interface InputBoxProps {
  onSend: (text: string) => void
  disabled: boolean
  customCommands: SlashCommand[]
  claudeCommands: SlashCommand[]
  onExecuteCommand: (command: SlashCommand, category: 'custom' | 'claude', args?: string) => void
  showBranchMenu?: boolean
  branchList?: string[]
  currentBranch?: string
  onBranchSelect?: (branch: string) => void
  onCloseBranchMenu?: () => void
}

export const InputBox: React.FC<InputBoxProps> = ({
  onSend,
  disabled,
  customCommands,
  claudeCommands,
  onExecuteCommand,
  showBranchMenu = false,
  branchList = [],
  currentBranch = '',
  onBranchSelect,
  onCloseBranchMenu,
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

  // Convert branches to SlashCommand format for the menu
  const branchCommands: SlashCommand[] = branchList.map((branch) => ({
    name: branch,
    description: branch === currentBranch ? '(current branch)' : `Switch to ${branch}`,
  }))

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Menu navigation when visible (either slash menu or branch menu)
    if (showSlashMenu || showBranchMenu) {
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
          if (showBranchMenu) {
            // Handle branch selection
            const selectedBranch = branchCommands[menuRef.current ? 0 : 0] // Will be updated by menu
            menuRef.current?.executeSelected()
          } else {
            menuRef.current?.executeSelected()
            setText('')
            setShowSlashMenu(false)
          }
          return
        case 'Escape':
          e.preventDefault()
          if (showBranchMenu) {
            onCloseBranchMenu?.()
          } else {
            setShowSlashMenu(false)
          }
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

  const handleBranchCommandSelect = (command: SlashCommand, category: 'custom' | 'claude') => {
    onBranchSelect?.(command.name)
  }

  return (
    <div className="input-box" style={{ position: 'relative' }}>
      {showBranchMenu && (
        <SlashCommandMenu
          ref={menuRef}
          query=""
          customCommands={branchCommands}
          claudeCommands={[]}
          onSelectCommand={handleBranchCommandSelect}
          onClose={() => onCloseBranchMenu?.()}
        />
      )}
      {showSlashMenu && !showBranchMenu && (
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
