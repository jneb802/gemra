import React, { useState, useEffect } from 'react'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'
import { StatusBar } from './StatusBar'
import type { ClaudeMessage, ContainerStatus } from '../../../shared/types'
import { generateId } from '../../../shared/utils/id'

interface ClaudeChatProps {
  agentId: string
  workingDir: string
}

type ClaudeMode = 'default' | 'acceptEdits' | 'plan'

export const ClaudeChat: React.FC<ClaudeChatProps> = ({ agentId, workingDir }) => {
  const [messages, setMessages] = useState<ClaudeMessage[]>([])
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gitBranch, setGitBranch] = useState<string>('main')
  const [gitStats, setGitStats] = useState({ filesChanged: 0, insertions: 0, deletions: 0 })
  const [mode, setMode] = useState<ClaudeMode>('default')
  const [model, setModel] = useState<string>('sonnet')
  const [tokenUsage, setTokenUsage] = useState({ inputTokens: 0, outputTokens: 0 })
  const [containerStatus, setContainerStatus] = useState<ContainerStatus>('disabled')
  const [containerError, setContainerError] = useState<string | undefined>()

  useEffect(() => {
    console.log('[ClaudeChat] Mounted with agentId:', agentId)

    // Get git branch
    window.electron.claude.getGitBranch(workingDir).then((result) => {
      if (result.success) {
        setGitBranch(result.branch)
      }
    })

    // Get git stats
    window.electron.claude.getGitStats(workingDir).then((result) => {
      if (result.success) {
        setGitStats({
          filesChanged: result.filesChanged,
          insertions: result.insertions,
          deletions: result.deletions,
        })
      }
    })

    // Poll git stats every 2 seconds
    const statsInterval = setInterval(() => {
      window.electron.claude.getGitStats(workingDir).then((result) => {
        if (result.success) {
          setGitStats({
            filesChanged: result.filesChanged,
            insertions: result.insertions,
            deletions: result.deletions,
          })
        }
      })
    }, 2000)

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
              id: generateId.message(),
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

    // Listen for token usage
    const unlistenUsage = window.electron.claude.onUsage((data) => {
      if (data.agentId === agentId) {
        console.log('[ClaudeChat] Token usage:', data.usage)
        setTokenUsage((prev) => ({
          inputTokens: prev.inputTokens + data.usage.inputTokens,
          outputTokens: prev.outputTokens + data.usage.outputTokens,
        }))
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

    // Listen for container status changes
    const unlistenContainer = window.electron.claude.onContainerStatus((data) => {
      if (data.agentId === agentId) {
        console.log('[ClaudeChat] Container status:', data.status, data.error)
        setContainerStatus(data.status as ContainerStatus)
        setContainerError(data.error)
      }
    })

    return () => {
      unlistenText()
      unlistenStatus()
      unlistenUsage()
      unlistenError()
      unlistenContainer()
      clearInterval(statsInterval)
    }
  }, [agentId, workingDir])

  // Handle Shift+Tab to cycle modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()

        setMode((current) => {
          const modes: ClaudeMode[] = ['default', 'acceptEdits', 'plan']
          const currentIndex = modes.indexOf(current)
          const nextIndex = (currentIndex + 1) % modes.length
          return modes[nextIndex]
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSend = async (text: string) => {
    console.log('[ClaudeChat] Sending message:', text)

    // Clear any previous error
    setError(null)

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        id: generateId.message(),
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

  const handleContainerToggle = () => {
    console.log('[ClaudeChat] Container toggle clicked - current status:', containerStatus)
    // TODO: Implement agent restart with toggled Docker mode
    // For now, this is a placeholder
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

      <StatusBar
        mode={mode}
        model={model}
        gitBranch={gitBranch}
        gitStats={gitStats}
        tokenUsage={tokenUsage}
        containerStatus={containerStatus}
        containerError={containerError}
        onModeChange={setMode}
        onModelChange={setModel}
        onContainerToggle={handleContainerToggle}
      />

      <InputBox onSend={handleSend} disabled={isWorking} />
    </div>
  )
}
