import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { SlashCommandMenu, SlashCommand, SlashCommandMenuHandle } from './SlashCommandMenu'
import { CompactImageChip, AttachedImage } from './ImageAttachment'
import { IconModeToggle } from '../InputMode'
import { StatusChips } from './StatusChips'
import { ModelSelector } from './ModelSelector'
import { AgentModeSelector } from './AgentModeSelector'
import { CompactContextIndicator } from './CompactContextIndicator'
import { useInputModeStore } from '../../stores/inputModeStore'
import { detectInputType } from '../../utils/inputDetection'
import type { MessageContent, ContainerStatus } from '../../../shared/types'
import type { Worktree, WorktreeMenuMode } from './hooks/useWorktreeOperations'

interface InputBoxProps {
  onSend: (content: string | MessageContent[]) => void
  disabled: boolean
  customCommands: SlashCommand[]
  claudeCommands: SlashCommand[]
  onExecuteCommand: (command: SlashCommand, category: 'custom' | 'claude', args?: string) => void
  onExecuteCommandFromInput?: (command: string) => void
  tabId?: string
  showBranchMenu?: boolean
  branchList?: string[]
  currentBranch?: string
  onBranchSelect?: (branch: string) => void
  onCloseBranchMenu?: () => void
  showWorktreeMenu?: boolean
  worktreeList?: Worktree[]
  worktreeMenuMode?: WorktreeMenuMode
  onWorktreeSelect?: (worktree: Worktree) => void
  onCloseWorktreeMenu?: () => void
  onWorktreeSubcommand?: (subcommand: string, args?: string) => void
  onShowWorktreeSubcommands?: () => void
  onShowWorktreeList?: () => void
  workingDir: string
  gitBranch: string
  gitStats: { filesChanged: number; insertions: number; deletions: number }
  model: string
  onModelChange: (model: string) => void
  onBranchClick: () => void
  agentMode: 'default' | 'acceptEdits' | 'plan'
  onAgentModeChange: (mode: 'default' | 'acceptEdits' | 'plan') => void
  containerStatus: ContainerStatus
  containerError?: string
  onContainerToggle: () => void
  tokenUsage: { inputTokens: number; outputTokens: number }
  dangerouslySkipPermissions?: boolean
  isWorking?: boolean
  onStop?: () => void
}

export const InputBox: React.FC<InputBoxProps> = ({
  onSend,
  disabled,
  customCommands,
  claudeCommands,
  onExecuteCommand,
  onExecuteCommandFromInput,
  tabId,
  showBranchMenu = false,
  branchList = [],
  currentBranch = '',
  onBranchSelect,
  onCloseBranchMenu,
  showWorktreeMenu = false,
  worktreeList = [],
  worktreeMenuMode = 'list',
  onWorktreeSelect,
  onCloseWorktreeMenu,
  onWorktreeSubcommand,
  onShowWorktreeSubcommands,
  onShowWorktreeList,
  workingDir,
  gitBranch,
  gitStats,
  model,
  onModelChange,
  onBranchClick,
  agentMode,
  onAgentModeChange,
  containerStatus,
  containerError,
  onContainerToggle,
  tokenUsage,
  dangerouslySkipPermissions = false,
  isWorking = false,
  onStop,
}) => {
  const [text, setText] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<SlashCommandMenuHandle>(null)

  // Input mode state - reactive subscription that triggers re-renders
  const currentMode = useInputModeStore((state) =>
    tabId ? (state.tabModes[tabId] || state.globalMode) : state.globalMode
  )
  const setTabMode = useInputModeStore((state) => state.setTabMode)

  // Autofocus on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  // Attach an image from a File object
  const attachImage = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.error('File is not an image:', file.type)
      return
    }

    // Validate file size (5MB limit for Claude API)
    if (file.size > 5 * 1024 * 1024) {
      console.error('Image too large (max 5MB):', file.size)
      return
    }

    // Read file as data URL
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string

      setAttachedImages((prev) => [
        ...prev,
        {
          id: `img-${Date.now()}-${Math.random()}`,
          name: file.name,
          mimeType: file.type,
          dataUrl: dataUrl,
          size: file.size,
        },
      ])
    }
    reader.onerror = () => {
      console.error('Failed to read file:', reader.error)
    }
    reader.readAsDataURL(file)
  }

  // Handle paste events
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          await attachImage(file)
        }
      }
    }
  }

  // Handle drag and drop
  const handleDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (!files) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.type.startsWith('image/')) {
        await attachImage(file)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
  }

  const handleSend = () => {
    if (!text.trim() && attachedImages.length === 0) return

    // Skip slash commands (handled separately)
    if (text.trim().startsWith('/')) {
      onSend(text)
      setText('')
      setAttachedImages([])
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      return
    }

    // Determine target based on mode
    let target: 'command' | 'ai'
    if (currentMode === 'auto') {
      // Auto-detect only for text-only input
      target = attachedImages.length === 0 ? detectInputType(text) : 'ai'
    } else {
      target = currentMode === 'command' ? 'command' : 'ai'
    }

    console.log('[InputBox] Mode:', currentMode, 'Target:', target, 'Input:', text.substring(0, 50))

    // Route to command execution or Claude chat
    if (target === 'command' && onExecuteCommandFromInput && attachedImages.length === 0) {
      onExecuteCommandFromInput(text.trim())
      setText('')
      setAttachedImages([])
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      return
    }

    // Otherwise, send to Claude (AI mode or has images)
    // Build message content
    if (attachedImages.length === 0) {
      // Text-only message
      onSend(text)
    } else {
      // Multimodal message
      const content: MessageContent[] = []

      // Add images first
      attachedImages.forEach((img) => {
        // Extract base64 data (remove data URL prefix)
        const base64Data = img.dataUrl.split(',')[1]
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType,
            data: base64Data,
          },
        })
      })

      // Add text if present
      if (text.trim()) {
        content.push({
          type: 'text',
          text: text,
        })
      }

      onSend(content)
    }

    // Clear state
    setText('')
    setAttachedImages([])

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

  // Convert worktrees to SlashCommand format for the menu
  const worktreeCommands: SlashCommand[] = worktreeList.map((worktree) => ({
    name: worktree.path,
    description: `${worktree.branch}${worktree.isMain ? ' (main)' : ''} - ${worktree.commit.substring(0, 7)}`,
  }))

  // Worktree sub-commands
  const worktreeSubcommands: SlashCommand[] = [
    { name: 'create', description: 'Create a new worktree', argumentHint: '<path> <branch>' },
    { name: 'remove', description: 'Remove a worktree', argumentHint: '<path>' },
    { name: 'prune', description: 'Prune deleted worktrees' },
    { name: 'list', description: 'List all worktrees' },
  ]

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle "/" key when in worktree list mode to show subcommands
    if (showWorktreeMenu && worktreeMenuMode === 'list' && e.key === '/') {
      e.preventDefault()
      onShowWorktreeSubcommands?.()
      return
    }

    // Menu navigation when visible (slash menu, branch menu, or worktree menu)
    if (showSlashMenu || showBranchMenu || showWorktreeMenu) {
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
            menuRef.current?.executeSelected()
          } else if (showWorktreeMenu) {
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
          } else if (showWorktreeMenu) {
            // If in subcommands mode, go back to list
            if (worktreeMenuMode === 'subcommands') {
              onShowWorktreeList?.()
            } else {
              onCloseWorktreeMenu?.()
            }
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

  const handleWorktreeCommandSelect = (command: SlashCommand, category: 'custom' | 'claude') => {
    if (worktreeMenuMode === 'list') {
      // Selecting a worktree from the list
      const selectedWorktree = worktreeList.find((wt) => wt.path === command.name)
      if (selectedWorktree) {
        onWorktreeSelect?.(selectedWorktree)
      }
    } else {
      // Executing a subcommand
      onWorktreeSubcommand?.(command.name)
    }
  }

  const handleModeChange = (newMode: 'auto' | 'command' | 'ai') => {
    if (tabId) {
      setTabMode(tabId, newMode)
    }
  }

  return (
    <div className="input-box">
      {showBranchMenu && (
        <SlashCommandMenu
          ref={menuRef}
          query=""
          customCommands={branchCommands}
          claudeCommands={[]}
          onSelectCommand={handleBranchCommandSelect}
          onClose={() => onCloseBranchMenu?.()}
          customTabLabel="Branches"
        />
      )}
      {showWorktreeMenu && !showBranchMenu && (
        <SlashCommandMenu
          ref={menuRef}
          query=""
          customCommands={worktreeMenuMode === 'list' ? worktreeCommands : worktreeSubcommands}
          claudeCommands={[]}
          onSelectCommand={handleWorktreeCommandSelect}
          onClose={() => onCloseWorktreeMenu?.()}
          customTabLabel={worktreeMenuMode === 'list' ? 'Worktrees (/ for commands)' : 'Worktree Commands'}
        />
      )}
      {showSlashMenu && !showBranchMenu && !showWorktreeMenu && (
        <SlashCommandMenu
          ref={menuRef}
          query={slashQuery}
          customCommands={customCommands}
          claudeCommands={claudeCommands}
          onSelectCommand={handleSelectCommand}
          onClose={() => setShowSlashMenu(false)}
        />
      )}

      {/* Top row - Status chips */}
      <StatusChips
        workingDir={workingDir}
        gitBranch={gitBranch}
        gitStats={gitStats}
        containerStatus={containerStatus}
        containerError={containerError}
        onBranchClick={onBranchClick}
        onContainerToggle={onContainerToggle}
        dangerouslySkipPermissions={dangerouslySkipPermissions}
      />

      {/* Middle row - Textarea with image chip */}
      <div className="input-box-textarea-row">
        <textarea
          ref={textareaRef}
          className="input-textarea"
          style={{
            paddingRight: attachedImages.length > 0 ? '140px' : undefined
          }}
          placeholder={
            disabled
              ? 'Type your next message... (will send after response)'
              : 'Type your message... (Enter to send, Shift+Enter for new line, / for commands, paste images)'
          }
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          rows={1}
        />

        {/* Compact image chip inside the input field */}
        {attachedImages.length > 0 && (
          <CompactImageChip
            images={attachedImages}
            onRemove={() => setAttachedImages([])}
          />
        )}
      </div>

      {/* Bottom row - Controls */}
      <div className="input-box-controls">
        <IconModeToggle
          mode={currentMode}
          onModeChange={handleModeChange}
          disabled={disabled}
        />

        <AgentModeSelector
          mode={agentMode}
          onModeChange={onAgentModeChange}
          disabled={disabled}
        />

        <CompactContextIndicator
          inputTokens={tokenUsage.inputTokens}
          outputTokens={tokenUsage.outputTokens}
          model={model}
        />

        <ModelSelector
          model={model}
          onModelChange={onModelChange}
          disabled={disabled}
        />

        {isWorking && onStop && (
          <button
            className="input-stop-button"
            onClick={onStop}
            title="Stop generation (Esc)"
          >
            <span className="input-stop-icon" />
          </button>
        )}
      </div>
    </div>
  )
}
