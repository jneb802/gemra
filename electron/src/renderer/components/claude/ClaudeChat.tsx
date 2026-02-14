import React, { useState, useEffect } from 'react'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'
import type { ClaudeMessage } from '../../../shared/types'

interface ClaudeChatProps {
  agentId: string
  workingDir: string
}

export const ClaudeChat: React.FC<ClaudeChatProps> = ({ agentId, workingDir }) => {
  const [messages, setMessages] = useState<ClaudeMessage[]>([])
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    console.log('[ClaudeChat] Mounted with agentId:', agentId)

    // Listen for text responses from Claude
    const unlistenText = window.electron.claude.onText((data) => {
      if (data.agentId === agentId) {
        console.log('[ClaudeChat] Received text:', data.text)

        // Add or append to assistant message
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1]

          // If last message is from assistant, append to it
          if (lastMessage && lastMessage.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                content: lastMessage.content + data.text,
              },
            ]
          }

          // Otherwise, create new assistant message
          return [
            ...prev,
            {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content: data.text,
            },
          ]
        })
      }
    })

    // Listen for status changes
    const unlistenStatus = window.electron.claude.onStatus((data) => {
      if (data.agentId === agentId) {
        console.log('[ClaudeChat] Status changed:', data.status)
        setIsWorking(data.status === 'working')
      }
    })

    // Listen for errors
    const unlistenError = window.electron.claude.onError((data) => {
      if (data.agentId === agentId) {
        console.error('[ClaudeChat] Error:', data.error)
        setError(data.error)
        setIsWorking(false)
      }
    })

    return () => {
      unlistenText()
      unlistenStatus()
      unlistenError()
    }
  }, [agentId])

  const handleSend = async (text: string) => {
    console.log('[ClaudeChat] Sending message:', text)

    // Clear any previous error
    setError(null)

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: text,
      },
    ])

    // Set working state
    setIsWorking(true)

    // Send to agent
    try {
      const result = await window.electron.claude.send(agentId, text)
      if (!result.success) {
        setError(result.error || 'Failed to send message')
        setIsWorking(false)
      }
    } catch (err) {
      console.error('[ClaudeChat] Failed to send:', err)
      setError('Failed to send message')
      setIsWorking(false)
    }
  }

  return (
    <div className="claude-chat">
      <div className="claude-chat-header">
        <span className="working-dir">{workingDir}</span>
      </div>

      <MessageList messages={messages} />

      {isWorking && (
        <div className="thinking-indicator">
          <span className="thinking-dots">Claude is working</span>
        </div>
      )}

      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}

      <InputBox onSend={handleSend} disabled={isWorking} />
    </div>
  )
}
