import React, { useState } from 'react'
import type { TerminalBlock } from '../../../shared/types/blocks'
import { showToast } from '../Toast/ToastContainer'

interface BlockActionsProps {
  block: TerminalBlock
  onRerun?: (command: string) => void
  onCopyCommand?: () => void
  onCopyOutput?: () => void
  onToggleCollapse?: () => void
  onExplainError?: () => void
  onFixCommand?: () => void
  onSendToChat?: () => void
  onAnalyzeOutput?: () => void
}

/**
 * BlockActions - Action buttons for terminal blocks
 *
 * Appears on hover, similar to chat message actions
 */
export function BlockActions({
  block,
  onRerun,
  onCopyCommand,
  onCopyOutput,
  onToggleCollapse,
  onExplainError,
  onFixCommand,
  onSendToChat,
  onAnalyzeOutput,
}: BlockActionsProps) {
  const [showMenu, setShowMenu] = useState(false)

  const handleCopyCommand = async () => {
    if (block.command) {
      try {
        await navigator.clipboard.writeText(block.command)
        showToast('Command copied to clipboard')
      } catch (error) {
        showToast('Failed to copy command', 'error')
      }
    }
    onCopyCommand?.()
  }

  const handleCopyOutput = async () => {
    if (block.content) {
      try {
        await navigator.clipboard.writeText(block.content)
        showToast('Output copied to clipboard')
      } catch (error) {
        showToast('Failed to copy output', 'error')
      }
    }
    onCopyOutput?.()
  }

  const handleRerun = () => {
    if (block.command && onRerun) {
      onRerun(block.command)
    }
  }

  // Command block actions
  if (block.type === 'command') {
    const hasFailed = block.exitCode !== undefined && block.exitCode !== 0

    return (
      <div className="block-actions">
        <button
          className="block-action-button"
          onClick={handleCopyCommand}
          title="Copy command"
        >
          <span className="action-icon">📋</span>
        </button>
        {onRerun && (
          <button
            className="block-action-button"
            onClick={handleRerun}
            title="Re-run command"
          >
            <span className="action-icon">▶️</span>
          </button>
        )}
        {hasFailed && onExplainError && (
          <button
            className="block-action-button ai-action"
            onClick={onExplainError}
            title="Explain error with AI"
          >
            <span className="action-icon">💡</span>
          </button>
        )}
        {hasFailed && onFixCommand && (
          <button
            className="block-action-button ai-action"
            onClick={onFixCommand}
            title="Fix command with AI"
          >
            <span className="action-icon">🔧</span>
          </button>
        )}
      </div>
    )
  }

  // Output block actions
  if (block.type === 'output') {
    const outputLines = block.content.split('\n').length
    const isLongOutput = outputLines > 20
    const hasError = block.exitCode !== undefined && block.exitCode !== 0

    return (
      <div className="block-actions">
        <button
          className="block-action-button"
          onClick={handleCopyOutput}
          title="Copy output"
        >
          <span className="action-icon">📋</span>
        </button>
        {isLongOutput && onToggleCollapse && (
          <button
            className="block-action-button"
            onClick={onToggleCollapse}
            title={block.collapsed ? 'Expand output' : 'Collapse output'}
          >
            <span className="action-icon">{block.collapsed ? '⬇️' : '⬆️'}</span>
          </button>
        )}
        {onSendToChat && (
          <button
            className="block-action-button ai-action"
            onClick={onSendToChat}
            title="Send to chat"
          >
            <span className="action-icon">💬</span>
          </button>
        )}
        {onAnalyzeOutput && block.content.trim() && (
          <button
            className="block-action-button ai-action"
            onClick={onAnalyzeOutput}
            title="Analyze with AI"
          >
            <span className="action-icon">🔍</span>
          </button>
        )}
      </div>
    )
  }

  return null
}
