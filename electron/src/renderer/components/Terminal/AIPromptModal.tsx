import React, { useRef } from 'react'
import { showToast } from '../Toast/ToastContainer'

interface AIPromptModalProps {
  isOpen: boolean
  title: string
  prompt: string
  onClose: () => void
  onSendToChat?: () => void
}

/**
 * AIPromptModal - Shows AI prompt with copy button
 *
 * When terminal blocks need AI help, this modal displays the prompt
 * that would be sent to Claude, with options to copy or send to chat.
 */
export function AIPromptModal({
  isOpen,
  title,
  prompt,
  onClose,
  onSendToChat,
}: AIPromptModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  if (!isOpen) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      showToast('Prompt copied to clipboard')
    } catch (error) {
      console.error('Failed to copy:', error)
      showToast('Failed to copy prompt', 'error')
    }
  }

  const handleSelectAll = () => {
    if (textareaRef.current) {
      textareaRef.current.select()
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content ai-prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p className="ai-prompt-description">
            This prompt will be sent to Claude to analyze your terminal output:
          </p>

          <textarea
            ref={textareaRef}
            className="ai-prompt-textarea"
            value={prompt}
            readOnly
            rows={15}
            onClick={handleSelectAll}
          />

          <div className="ai-prompt-actions">
            <button className="ai-prompt-button" onClick={handleCopy}>
              📋 Copy Prompt
            </button>
            {onSendToChat && (
              <button className="ai-prompt-button primary" onClick={onSendToChat}>
                💬 Send to Chat
              </button>
            )}
          </div>

          <p className="ai-prompt-hint">
            {onSendToChat
              ? 'Click "Send to Chat" to ask Claude, or copy the prompt to use elsewhere.'
              : 'Copy this prompt and paste it into a Claude chat tab to get help.'}
          </p>
        </div>

        <div className="modal-footer">
          <button className="modal-button modal-button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
