import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'
import { WelcomeScreen } from '../Welcome/WelcomeScreen'
import type { ClaudeMessage, AgentStatus, ToolExecution, ContainerStatus, MessageMetadata, MessageContent } from '../../../shared/types'
import { generateId } from '../../../shared/utils/id'
import type { SlashCommand } from './SlashCommandMenu'
import { useTabStore } from '../../stores/tabStore'
import { useSettingsStore } from '../../stores/settingsStore'

interface ClaudeChatProps {
  agentId?: string // Optional - will be initialized on first message
  workingDir: string
  onUserMessage?: () => void
  onCreateProject: () => void
  onOpenRepository: () => void
  onCloneRepository: () => void
  onOpenRecent: (path: string) => void
}

type ClaudeMode = 'default' | 'acceptEdits' | 'plan'

export const ClaudeChat: React.FC<ClaudeChatProps> = ({
  agentId,
  workingDir,
  onUserMessage,
  onCreateProject,
  onOpenRepository,
  onCloneRepository,
  onOpenRecent
}) => {
  const [messages, setMessages] = useState<ClaudeMessage[]>([])
  const [isWorking, setIsWorking] = useState(false)
  const [isInitializingAgent, setIsInitializingAgent] = useState(false)
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
  const [messageQueue, setMessageQueue] = useState<Array<string | MessageContent[]>>([])
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const [branchList, setBranchList] = useState<string[]>([])
  const [isTogglingContainer, setIsTogglingContainer] = useState(false)
  const [dangerouslySkipPermissions, setDangerouslySkipPermissions] = useState(false)

  // Store references
  const updateTabAgent = useTabStore((state) => state.updateTabAgent)
  const tabs = useTabStore((state) => state.tabs)
  const activeTabId = useTabStore((state) => state.activeTabId)
  const useDocker = useSettingsStore((state) => state.useDocker)
  const currentAgentIdRef = useRef<string | undefined>(agentId)

  // Define custom commands
  const CUSTOM_COMMANDS: SlashCommand[] = [
    { name: 'help', description: 'Show all available commands' },
    { name: 'clear', description: 'Clear chat history' },
    { name: 'mode', description: 'Switch agent mode', argumentHint: '<default|acceptEdits|plan>' },
    { name: 'model', description: 'Switch model', argumentHint: '<opus|sonnet|haiku>' },
    { name: 'new-terminal', description: 'Open new terminal tab' },
    { name: 'new-chat', description: 'Start new chat session' },
    { name: 'git-status', description: 'Show git status' },
    { name: 'checkout', description: 'Checkout git branches' },
    { name: 'branch', description: 'Create a new git branch', argumentHint: '<name>' },
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

  // Initialize agent (lazy initialization on first message)
  const initializeAgent = useCallback(async (): Promise<string | null> => {
    console.log('[ClaudeChat] Initializing agent...')
    setIsInitializingAgent(true)
    setError(null)

    try {
      const result = await window.electron.claude.start(workingDir, undefined, useDocker)

      if (result.success && result.agentId) {
        console.log('[ClaudeChat] Agent initialized:', result.agentId)

        // Update the tab with the new agent ID
        if (activeTabId) {
          updateTabAgent(activeTabId, result.agentId)
        }

        // Update ref
        currentAgentIdRef.current = result.agentId

        return result.agentId
      } else {
        console.error('[ClaudeChat] Failed to initialize agent:', result.error)
        setError(result.error || 'Failed to start agent')
        return null
      }
    } catch (err) {
      console.error('[ClaudeChat] Exception initializing agent:', err)
      setError(err instanceof Error ? err.message : 'Failed to start agent')
      return null
    } finally {
      setIsInitializingAgent(false)
    }
  }, [workingDir, useDocker, updateTabAgent, activeTabId])

  // Sync currentAgentIdRef with prop changes
  useEffect(() => {
    currentAgentIdRef.current = agentId
  }, [agentId])

  useEffect(() => {
    console.log('[ClaudeChat] Mounted with agentId:', agentId)

    // Get git branch
    window.electron.claude.getGitBranch(workingDir).then((result) => {
      if (result.success) {
        setGitBranch(result.branch)
      }
    })

    // Check permissions mode
    window.electron.claude.getPermissionsMode().then((result) => {
      setDangerouslySkipPermissions(result.dangerouslySkipPermissions)
    })

    // Get initial git stats and start polling
    updateGitStats()
    const statsInterval = setInterval(updateGitStats, 2000)

    // Fetch Claude commands from SDK (only if agent is initialized)
    if (agentId) {
      window.electron.claude.getSupportedCommands(agentId).then((result) => {
        if (result.commands) {
          setClaudeCommands(result.commands)
        }
      }).catch((error) => {
        console.error('[ClaudeChat] Failed to fetch Claude commands:', error)
      })
    }

    // Listen for text responses from Claude
    const unlistenText = window.electron.claude.onText((data) => {
      if (data.agentId === currentAgentIdRef.current) {
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
      if (data.agentId === currentAgentIdRef.current) {
        console.log('[ClaudeChat] Status changed:', data.status)
        setIsWorking(data.status === 'working')
      }
    })

    // Listen for token usage
    const unlistenUsage = window.electron.claude.onUsage((data) => {
      if (data.agentId === currentAgentIdRef.current) {
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
      if (data.agentId === currentAgentIdRef.current) {
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
      if (data.agentId === currentAgentIdRef.current) {
        console.log('[ClaudeChat] Tool execution:', data.tool)
        setCurrentTool(data.tool)
      }
    })

    // Listen for errors
    const unlistenError = window.electron.claude.onError((data) => {
      if (data.agentId === currentAgentIdRef.current) {
        console.error('[ClaudeChat] Error:', data.error)
        setError(data.error)
        setIsWorking(false)
        setAgentStatus({ type: 'idle' })
      }
    })

    // Listen for container status changes
    const unlistenContainer = window.electron.claude.onContainerStatus((data) => {
      if (data.agentId === currentAgentIdRef.current) {
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

  const sendMessageInternal = useCallback(async (content: string | MessageContent[]) => {
    console.log('[ClaudeChat] Sending content:', typeof content === 'string' ? content : `[${content.length} blocks]`)

    // Ensure we have an agent ID
    const activeAgentId = currentAgentIdRef.current
    if (!activeAgentId) {
      console.error('[ClaudeChat] No agent ID available')
      setError('Agent not initialized')
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
        content: content,
      },
    ])

    // Set working state
    setIsWorking(true)

    // Send to agent
    try {
      const result = await window.electron.claude.send(activeAgentId, content)
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
  }, [])

  const handleSend = useCallback(async (content: string | MessageContent[]) => {
    // Notify parent that user sent a message (to dismiss welcome overlay)
    onUserMessage?.()

    // If agent not initialized yet, initialize it first (lazy initialization)
    if (!currentAgentIdRef.current && !isInitializingAgent) {
      console.log('[ClaudeChat] Agent not initialized, starting it now...')
      const newAgentId = await initializeAgent()

      if (!newAgentId) {
        // Agent failed to initialize, error already set
        return
      }
    }

    // If already working or initializing, queue the message instead
    if (isWorking || isInitializingAgent) {
      console.log('[ClaudeChat] Agent busy/initializing, queueing message')
      setMessageQueue((prev) => [...prev, content])
      return
    }

    await sendMessageInternal(content)
  }, [isWorking, isInitializingAgent, sendMessageInternal, onUserMessage, initializeAgent])

  // Process queued messages when agent becomes idle
  useEffect(() => {
    if (!isWorking && messageQueue.length > 0) {
      const [nextMessage, ...remainingQueue] = messageQueue
      console.log('[ClaudeChat] Agent idle, processing queued message:', nextMessage)
      setMessageQueue(remainingQueue)
      // Small delay to ensure state is clean
      setTimeout(() => sendMessageInternal(nextMessage), 100)
    }
  }, [isWorking, messageQueue, sendMessageInternal])

  const handleContainerToggle = useCallback(async () => {
    console.log('[ClaudeChat] Container toggle clicked - current status:', containerStatus)

    // Prevent multiple toggles at once
    if (isTogglingContainer || isWorking) {
      console.log('[ClaudeChat] Toggle already in progress or agent is working')
      return
    }

    // Only allow toggle when disabled, running, or error (error = retry)
    if (containerStatus !== 'disabled' && containerStatus !== 'running' && containerStatus !== 'error') {
      console.log('[ClaudeChat] Cannot toggle during build/start states')
      return
    }

    setIsTogglingContainer(true)

    try {
      // Determine new Docker state
      // If error, retry with Docker enabled (assumes user fixed the issue)
      // Otherwise, toggle the current state
      const newDockerState = containerStatus === 'error' ? true : containerStatus === 'disabled'
      const modeText = newDockerState ? 'container' : 'host'

      // Add system message about restart
      if (containerStatus === 'error') {
        addSystemMessage(`🔄 Retrying container mode...`)
      } else {
        addSystemMessage(`🔄 Restarting agent in ${modeText} mode...`)
      }

      // Stop current agent
      console.log('[ClaudeChat] Stopping current agent:', currentAgentIdRef.current)
      await window.electron.claude.stop(currentAgentIdRef.current)

      // Small delay to ensure cleanup
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Start new agent with toggled Docker state
      console.log('[ClaudeChat] Starting new agent with Docker:', newDockerState)
      const result = await window.electron.claude.start(workingDir, undefined, newDockerState)

      if (result.success && result.agentId) {
        console.log('[ClaudeChat] New agent started:', result.agentId)

        // Update agent ID reference
        currentAgentIdRef.current = result.agentId

        // Update the tab's agent ID in store
        if (activeTabId) {
          updateTabAgent(activeTabId, result.agentId)
        }

        // Add success message
        addSystemMessage(`✓ Agent restarted in ${modeText} mode`)

        // Note: The new agent's container status will be emitted via IPC events
        // and picked up by the useEffect listener
      } else {
        console.error('[ClaudeChat] Failed to start new agent:', result.error)
        addSystemMessage(`✗ Failed to restart agent: ${result.error || 'Unknown error'}`)
        setContainerStatus('error')
        setContainerError(result.error)
      }
    } catch (error) {
      console.error('[ClaudeChat] Container toggle error:', error)
      addSystemMessage(
        `✗ Error toggling container: ${error instanceof Error ? error.message : String(error)}`
      )
      setContainerStatus('error')
      setContainerError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsTogglingContainer(false)
    }
  }, [
    containerStatus,
    isTogglingContainer,
    isWorking,
    workingDir,
    agentId,
    tabs,
    updateTabAgent,
  ])

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

      case 'checkout': {
        // If args provided, checkout that branch directly
        if (args) {
          window.electron.claude.checkoutBranch(workingDir, args).then((result) => {
            if (result.success && result.branch) {
              setGitBranch(result.branch)
              addSystemMessage(`✓ Checked out branch: ${result.branch}`)
            } else {
              addSystemMessage(`✗ Failed to checkout branch: ${args}\n\n${result.error || 'Unknown error'}`)
            }
          }).catch((error) => {
            addSystemMessage(`✗ Error checking out branch: ${error.message}`)
          })
          return
        }

        // No args - fetch branches and show in menu
        window.electron.claude.getGitBranches(workingDir).then((result) => {
          if (result.success && result.branches.length > 0) {
            setBranchList(result.branches)
            setShowBranchMenu(true)
          } else {
            addSystemMessage('No branches found')
          }
        }).catch((error) => {
          addSystemMessage(`Error fetching branches: ${error.message}`)
        })
        break
      }

      case 'branch': {
        if (!args) {
          addSystemMessage('Usage: /branch <name>')
          return
        }

        // Create and checkout new branch
        window.electron.claude.createBranch(workingDir, args, true).then((result) => {
          if (result.success && result.branch) {
            setGitBranch(result.branch)
            addSystemMessage(`✓ Created and checked out branch: ${result.branch}`)
          } else {
            addSystemMessage(`✗ Failed to create branch: ${args}\n\n${result.error || 'Unknown error'}`)
          }
        }).catch((error) => {
          addSystemMessage(`✗ Error creating branch: ${error.message}`)
        })
        break
      }

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

  // Handle branch selection
  const handleBranchSelect = (branch: string) => {
    window.electron.claude.checkoutBranch(workingDir, branch).then((result) => {
      if (result.success && result.branch) {
        setGitBranch(result.branch)
        addSystemMessage(`✓ Checked out branch: ${result.branch}`)
      } else {
        addSystemMessage(`✗ Failed to checkout branch: ${branch}\n\n${result.error || 'Unknown error'}`)
      }
    }).catch((error) => {
      addSystemMessage(`✗ Error checking out branch: ${error.message}`)
    })
    setShowBranchMenu(false)
    setBranchList([])
  }

  // Handle branch click in status bar
  const handleBranchClick = () => {
    window.electron.claude.getGitBranches(workingDir).then((result) => {
      if (result.success && result.branches.length > 0) {
        setBranchList(result.branches)
        setShowBranchMenu(true)
      } else {
        addSystemMessage('No branches found')
      }
    }).catch((error) => {
      addSystemMessage(`Error fetching branches: ${error.message}`)
    })
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

  // Handle command execution from input (Command/AI mode)
  const handleExecuteCommandFromInput = async (command: string) => {
    console.log('[ClaudeChat] Executing command from input:', command)

    // Show command being executed
    addSystemMessage(`$ ${command}`)

    // Send command to Claude with instruction to execute via Bash tool
    const prompt = `Execute this shell command and show me the output:\n\n\`\`\`bash\n${command}\n\`\`\``
    await handleSend(prompt)
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
      {/* Show welcome screen when there are no messages */}
      {messages.length === 0 ? (
        <WelcomeScreen
          onCreateProject={onCreateProject}
          onOpenRepository={onOpenRepository}
          onCloneRepository={onCloneRepository}
          onOpenRecent={onOpenRecent}
        />
      ) : (
        <MessageList
          messages={messages}
          isStreaming={agentStatus.type === 'streaming'}
          currentTurnMetadata={currentTurnMetadata}
        />
      )}

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

      {isInitializingAgent && (
        <div className="status-indicator thinking">
          <span className="status-icon">🚀</span>
          <span className="status-text">Starting Claude Code agent...</span>
        </div>
      )}

      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}

      <InputBox
        onSend={handleSend}
        disabled={isWorking || isInitializingAgent}
        customCommands={CUSTOM_COMMANDS}
        claudeCommands={claudeCommands}
        onExecuteCommand={handleExecuteCommand}
        onExecuteCommandFromInput={handleExecuteCommandFromInput}
        tabId={currentAgentIdRef.current}
        showBranchMenu={showBranchMenu}
        branchList={branchList}
        currentBranch={gitBranch}
        onBranchSelect={handleBranchSelect}
        onCloseBranchMenu={() => {
          setShowBranchMenu(false)
          setBranchList([])
        }}
        workingDir={workingDir}
        gitBranch={gitBranch}
        gitStats={gitStats}
        model={model}
        onModelChange={setModel}
        onBranchClick={handleBranchClick}
        agentMode={mode}
        onAgentModeChange={setMode}
        containerStatus={containerStatus}
        containerError={containerError}
        onContainerToggle={handleContainerToggle}
        tokenUsage={tokenUsage}
        dangerouslySkipPermissions={dangerouslySkipPermissions}
      />
    </div>
  )
}
