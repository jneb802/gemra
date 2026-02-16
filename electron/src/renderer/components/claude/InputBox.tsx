import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { SlashCommandMenu, SlashCommand, SlashCommandMenuHandle } from './SlashCommandMenu'
import { CompactImageChip, AttachedImage } from './ImageAttachment'
import { ModeToggle } from '../InputMode'
import { useInputModeStore } from '../../stores/inputModeStore'
import { detectInputType } from '../../utils/inputDetection'
import type { MessageContent } from '../../../shared/types'

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
}) => {
  const [text, setText] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<SlashCommandMenuHandle>(null)

  // Input mode state
  const globalMode = useInputModeStore((state) => state.globalMode)
  const getTabMode = useInputModeStore((state) => state.getTabMode)
  const setTabMode = useInputModeStore((state) => state.setTabMode)

  const currentMode = tabId ? getTabMode(tabId) : globalMode

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
      // TODO: Show user-friendly error
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

  const handleModeChange = (newMode: 'auto' | 'command' | 'ai') => {
    if (tabId) {
      setTabMode(tabId, newMode)
    }
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
          customTabLabel="Branches"
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

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        {/* Mode toggle */}
        <div style={{ paddingTop: '8px' }}>
          <ModeToggle
            mode={currentMode}
            onModeChange={handleModeChange}
            disabled={disabled}
          />
        </div>

        {/* Textarea container */}
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={textareaRef}
            className="input-textarea"
            style={{
              paddingRight: attachedImages.length > 0 ? '140px' : '12px', // Add space for chip
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

        <button
          className="send-button"
          onClick={handleSend}
          disabled={!text.trim() && attachedImages.length === 0}
          title={disabled ? 'Message will be queued and sent after current response' : 'Send message'}
        >
          {disabled && (text.trim() || attachedImages.length > 0) ? 'Queue' : 'Send'}
        </button>
      </div>
    </div>
  )
}
