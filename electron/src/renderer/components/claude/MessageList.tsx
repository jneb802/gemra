import React, { useEffect, useRef } from 'react'
import type { ClaudeMessage } from '../../../shared/types'

interface MessageListProps {
  messages: ClaudeMessage[]
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        <div className="empty-state">
          <p>Start a conversation with Claude Code</p>
          <p className="hint">Try asking: "What files are in this directory?"</p>
        </div>
      </div>
    )
  }

  // Helper to determine if message should be grouped with previous
  const isGroupedWithPrevious = (index: number): boolean => {
    if (index === 0) return false
    return messages[index].role === messages[index - 1].role
  }

  return (
    <div className="message-list">
      {messages.map((message, index) => (
        <div
          key={message.id}
          className={`message message-${message.role}${
            isGroupedWithPrevious(index) ? ' message-grouped' : ''
          }`}
        >
          <div className="message-content">
            {message.content}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}
