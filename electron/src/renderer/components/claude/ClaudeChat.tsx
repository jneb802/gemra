import React, { useState, useEffect, useRef } from 'react'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'
import { StatusBar } from './StatusBar'
import type { ClaudeMessage, AgentStatus, ToolExecution, ContainerStatus, MessageMetadata } from '../../../shared/types'
import { generateId } from '../../../shared/utils/id'
import type { SlashCommand } from './SlashCommandMenu'

interface ClaudeChatProps {
  agentId: string
  workingDir: string
}

type ClaudeMode = 'default' | 'acceptEdits' | 'plan'

export const ClaudeChat: React.FC<ClaudeChatProps> = ({ agentId, workingDir }) => {
  const [messages, setMessages] = useState<ClaudeMessage[]>([])
  const [isWorking, setIsWorking] = useState(false)
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({ type: 'idle' })
  const [currentTool, setCurrentTool] = useState<ToolExecution | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gitBranch, setGitBranch] = useState<string>('main')
  const [gitStats, setGitStats] = useState({ filesChanged: 0, insertions: 0, deletions: 0 })
  const [mode, setMode] = useState<ClaudeMode>('default')
  const [model, setModel] = useState<string>('sonnet')
  const [tokenUsage, setTokenUsage] = useState({ inputTokens: 0, outputTokens: 0 })
  const [containerStatus, setContainerStatus] = useState<ContainerStatus>('disabled')
  const [containerError, setContainerError] = useState<string | undefined>()
  const [claudeCommands, setClaudeCommands] = useState<SlashCommand[]>([])
  const [currentTurnMetadata, setCurrentTurnMetadata] = useState<MessageMetadata | null>(null)
  const lastAssistantMessageIdRef = useRef<string | null>(null)
  const [messageQueue, setMessageQueue] = useState<string[]>([])

  // Define custom commands
  const CUSTOM_COMMANDS: SlashCommand[] = [
    { name: 'help', description: 'Show all available commands' },
    { name: 'clear', description: 'Clear chat history' },
    { name: 'mode', description: 'Switch agent mode', argumentHint: '<default|acceptEdits|plan>' },
    { name: 'model', description: 'Switch model', argumentHint: '<opus|sonnet|haiku>' },
    { name: 'new-terminal', description: 'Open new terminal tab' },
    { name: 'new-chat', description: 'Start new chat session' },
    { name: 'git-status', description: 'Show git status' },
  ]

  // Update git stats helper
  const updateGitStats = async () => {
    const result = await window.electron.claude.getGitStats(workingDir)
    if (result.success) {
      setGitStats({
        filesChanged: result.filesChanged,
        insertions: result.insertions,
        deletions: result.deletions,
      })
    }
  }

  useEffect(() => {
    console.log('[ClaudeChat] Mounted with agentId:', agentId)

    // Get git branch
    window.electron.claude.getGitBranch(workingDir).then((result) => {
      if (result.success) {
        setGitBranch(result.branch)
      }
    })

    // Get initial git stats and start polling
    updateGitStats()
    const statsInterval = setInterval(updateGitStats, 2000)

    // Fetch Claude commands from SDK
    window.electron.claude.getSupportedCommands(agentId).then((result) => {
      if (result.commands) {
        setClaudeCommands(result.commands)
      }
    }).catch((error) => {
      console.error('[ClaudeChat] Failed to fetch Claude commands:', error)
    })

    // Listen for text responses from Claude
    const unlistenText = window.electron.claude.onText((data) => {
      if (data.agentId === agentId) {
        console.log('[ClaudeChat] Received text:', data.text)

        // Add or append to assistant message
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1]

          // If last message is from assistant, append to it
          if (lastMessage && lastMessage.role === 'assistant') {
            // Track ID for metadata attachment
            lastAssistantMessageIdRef.current = lastMessage.id
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                content: lastMessage.content + data.text,
              },
            ]
          }

          // Otherwise, create new assistant message
          const newId = generateId.message()
          lastAssistantMessageIdRef.current = newId
          return [
            ...prev,
            {
              id: newId,
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

        // Finalize metadata for current turn
        const now = Date.now()
        setCurrentTurnMetadata((prev) => {
          if (!prev) return null

          // Calculate final phase time
          const phaseElapsed = now - (prev.phaseStartTime || now)
          let finalThinkingTime = prev.thinkingTime || 0
          let finalStreamingTime = prev.streamingTime || 0
          let finalToolTime = prev.toolExecutionTime || 0

          if (prev.currentPhase === 'thinking') {
            finalThinkingTime += phaseElapsed
          } else if (prev.currentPhase === 'streaming') {
            finalStreamingTime += phaseElapsed
          } else if (prev.currentPhase === 'tool_execution') {
            finalToolTime += phaseElapsed
          }

          const totalDuration = now - (prev.startTime || now)
          const finalMetadata: MessageMetadata = {
            ...prev,
            thinkingTime: finalThinkingTime,
            streamingTime: finalStreamingTime,
            toolExecutionTime: finalToolTime,
            totalDuration,
            inputTokens: data.usage.inputTokens,
            outputTokens: data.usage.outputTokens,
            isComplete: true,
          }

          // Attach metadata to last assistant message
          if (lastAssistantMessageIdRef.current) {
            setMessages((msgs) =>
              msgs.map((msg) =>
                msg.id === lastAssistantMessageIdRef.current
                  ? { ...msg, metadata: finalMetadata }
                  : msg
              )
            )
          }

          return null // Clear current turn
        })
      }
    })

    // Listen for agent status updates (thinking, tool execution, streaming)
    const unlistenAgentStatus = window.electron.claude.onAgentStatus((data) => {
      if (data.agentId === agentId) {
        console.log('[ClaudeChat] Agent status:', data.status)
        setAgentStatus(data.status)

        // Update metadata with phase transitions
        setCurrentTurnMetadata((prev) => {
          if (!prev) return null

          const now = Date.now()
          const phaseElapsed = now - (prev.phaseStartTime || now)

          // Accumulate time from previous phase
          const updates: Partial<MessageMetadata> = {
            currentPhase: data.status.type,
            phaseStartTime: now,
          }

          // Add accumulated time based on previous phase
          if (prev.currentPhase === 'thinking') {
            updates.thinkingTime = (prev.thinkingTime || 0) + phaseElapsed
          } else if (prev.currentPhase === 'streaming') {
            updates.streamingTime = (prev.streamingTime || 0) + phaseElapsed
          } else if (prev.currentPhase === 'tool_execution') {
            updates.toolExecutionTime = (prev.toolExecutionTime || 0) + phaseElapsed
          }

          return { ...prev, ...updates }
        })
      }
    })

    // Listen for tool executions
    const unlistenToolExecution = window.electron.claude.onToolExecution((data) => {
      if (data.agentId === agentId) {
        console.log('[ClaudeChat] Tool execution:', data.tool)
        setCurrentTool(data.tool)
      }
    })

    // Listen for errors
    const unlistenError = window.electron.claude.onError((data) => {
      if (data.agentId === agentId) {
        console.error('[ClaudeChat] Error:', data.error)
        setError(data.error)
        setIsWorking(false)
        setAgentStatus({ type: 'idle' })
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
      unlistenAgentStatus()
      unlistenToolExecution()
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

  // Live timer effect for elapsed time updates
  useEffect(() => {
    if (!currentTurnMetadata || currentTurnMetadata.isComplete) return

    const interval = setInterval(() => {
      // Trigger re-render every 1s to update elapsed time
      setCurrentTurnMetadata((prev) => (prev ? { ...prev } : null))
    }, 1000)

    return () => clearInterval(interval)
  }, [currentTurnMetadata?.isComplete])

  // Process queued messages when agent becomes idle
  useEffect(() => {
    if (!isWorking && messageQueue.length > 0) {
      console.log('[ClaudeChat] Agent idle, processing queued message')
      processNextMessage()
    }
  }, [isWorking, messageQueue.length, processNextMessage])

  const handleSend = async (text: string) => {
    console.log('[ClaudeChat] Sending message:', text)

    // If already working, queue the message instead
    if (isWorking) {
      console.log('[ClaudeChat] Agent busy, queueing message')
      setMessageQueue((prev) => [...prev, text])
      return
    }

    // Clear any previous error
    setError(null)

    // Start tracking new turn
    setCurrentTurnMetadata({
      startTime: Date.now(),
      currentPhase: 'thinking',
      phaseStartTime: Date.now(),
      isComplete: false,
    })

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
        setCurrentTurnMetadata(null)
      }
    } catch (err) {
      console.error('[ClaudeChat] Failed to send:', err)
      setError('Failed to send message')
      setIsWorking(false)
      setCurrentTurnMetadata(null)
    }
  }

  // Process next queued message
  const processNextMessage = useCallback(() => {
    if (messageQueue.length > 0) {
      const [nextMessage, ...remainingQueue] = messageQueue
      setMessageQueue(remainingQueue)
      console.log('[ClaudeChat] Processing queued message:', nextMessage)
      // Small delay to ensure state is clean
      setTimeout(() => handleSend(nextMessage), 100)
    }
  }, [messageQueue])

  const handleContainerToggle = () => {
    console.log('[ClaudeChat] Container toggle clicked - current status:', containerStatus)
    // TODO: Implement agent restart with toggled Docker mode
    // For now, this is a placeholder
  }

  // Helper to add system messages
  const addSystemMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: generateId.message(),
        role: 'system' as const,
        content,
      },
    ])
  }

  // Format help text
  const formatHelpText = (custom: SlashCommand[], claude: SlashCommand[]): string => {
    let help = '**Custom Commands:**\n\n'
    custom.forEach((cmd) => {
      const args = cmd.argumentHint ? ` ${cmd.argumentHint}` : ''
      help += `• \`/${cmd.name}${args}\` - ${cmd.description}\n`
    })

    help += '\n**Claude Commands:**\n\n'
    if (claude.length === 0) {
      help += '• No Claude commands available\n'
    } else {
      claude.forEach((cmd) => {
        const args = cmd.argumentHint ? ` ${cmd.argumentHint}` : ''
        help += `• \`/${cmd.name}${args}\` - ${cmd.description}\n`
      })
    }

    return help
  }

  // Execute custom commands
  const executeCustomCommand = (command: SlashCommand, args?: string) => {
    switch (command.name) {
      case 'help':
        const helpText = formatHelpText(CUSTOM_COMMANDS, claudeCommands)
        addSystemMessage(helpText)
        break

      case 'clear':
        setMessages([])
        addSystemMessage('Chat history cleared')
        break

      case 'mode': {
        const validModes = ['default', 'acceptEdits', 'plan']
        if (!args || !validModes.includes(args)) {
          addSystemMessage(`Usage: /mode <${validModes.join('|')}>`)
          return
        }
        setMode(args as ClaudeMode)
        addSystemMessage(`Mode changed to: ${args}`)
        break
      }

      case 'model': {
        const validModels = ['opus', 'sonnet', 'haiku']
        if (!args || !validModels.includes(args)) {
          addSystemMessage(`Usage: /model <${validModels.join('|')}>`)
          return
        }
        setModel(args)
        addSystemMessage(`Model changed to: ${args}`)
        break
      }

      case 'new-terminal':
        window.electron.onMenuEvent('menu:new-tab', () => {})
        addSystemMessage('New terminal opened')
        break

      case 'new-chat':
        setMessages([])
        addSystemMessage('Started new chat session')
        break

      case 'git-status':
        window.electron.claude.getGitStats(workingDir).then((result) => {
          if (result.success) {
            const status = `Files: ${result.filesChanged}, +${result.insertions}, -${result.deletions}`
            addSystemMessage(`Git status: ${status}`)
          } else {
            addSystemMessage('Failed to get git status')
          }
        })
        break

      default:
        addSystemMessage(`Unknown command: ${command.name}`)
    }
  }

  // Execute Claude commands
  const executeClaudeCommand = (command: SlashCommand, args?: string) => {
    // Format command text
    const commandText = args ? `/${command.name} ${args}` : `/${command.name}`

    // Send as regular message - SDK handles interpretation
    handleSend(commandText)
  }

  // Handle command execution from InputBox
  const handleExecuteCommand = (
    command: SlashCommand,
    category: 'custom' | 'claude',
    args?: string
  ) => {
    console.log('[ClaudeChat] Executing command:', command.name, 'category:', category, 'args:', args)

    if (category === 'custom') {
      executeCustomCommand(command, args)
    } else {
      executeClaudeCommand(command, args)
    }
  }

  // Helper to get tool display name
  const getToolDisplayName = (toolName: string): string => {
    const toolMap: Record<string, string> = {
      Read: 'Reading file',
      Write: 'Writing file',
      Edit: 'Editing file',
      Bash: 'Running command',
      Grep: 'Searching code',
      Glob: 'Finding files',
      Task: 'Spawning agent',
      WebSearch: 'Searching web',
      WebFetch: 'Fetching URL',
    }
    return toolMap[toolName] || `Running ${toolName}`
  }

  return (
    <div className="claude-chat">
      <div className="claude-chat-header">
        <span className="working-dir">{workingDir}</span>
      </div>

      <MessageList
        messages={messages}
        isStreaming={agentStatus.type === 'streaming'}
        currentTurnMetadata={currentTurnMetadata}
      />

      {/* Status indicator */}
      {agentStatus.type === 'thinking' && (
        <div className="status-indicator thinking">
          <span className="status-icon">🤔</span>
          <span className="status-text">Thinking...</span>
        </div>
      )}

      {agentStatus.type === 'streaming' && isWorking && (
        <div className="status-indicator streaming">
          <span className="status-icon">✍️</span>
          <span className="status-text">Writing response...</span>
        </div>
      )}

      {agentStatus.type === 'tool_execution' && agentStatus.tool && (
        <div className="status-indicator tool-execution">
          <span className="status-icon">🔧</span>
          <span className="status-text">{getToolDisplayName(agentStatus.tool.name)}</span>
          {agentStatus.tool.name === 'Read' && agentStatus.tool.input?.file_path && (
            <span className="status-detail">{agentStatus.tool.input.file_path}</span>
          )}
          {agentStatus.tool.name === 'Bash' && agentStatus.tool.input?.command && (
            <span className="status-detail">{agentStatus.tool.input.command}</span>
          )}
          {agentStatus.tool.name === 'Grep' && agentStatus.tool.input?.pattern && (
            <span className="status-detail">"{agentStatus.tool.input.pattern}"</span>
          )}
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

      <InputBox
        onSend={handleSend}
        disabled={isWorking}
        customCommands={CUSTOM_COMMANDS}
        claudeCommands={claudeCommands}
        onExecuteCommand={handleExecuteCommand}
      />
    </div>
  )
}
