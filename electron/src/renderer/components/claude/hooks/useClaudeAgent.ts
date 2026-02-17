import { useEffect, useRef, useCallback, useState } from 'react'
import type { MessageContent } from '../../../../shared/types'
import { generateId } from '../../../../shared/utils/id'
import { TIMING } from '../../../../shared/constants'
import { useAgentStatus } from './useAgentStatus'
import { useClaudeChatStore } from '../../../stores/claudeChatStore'

/**
 * Hook for managing Claude agent lifecycle and IPC communication
 * Handles agent initialization, message sending, IPC events, and tool call tracking
 */

interface UseClaudeAgentOptions {
  agentId?: string
  workingDir: string
  useDocker: boolean
  onUserMessage?: () => void
  onUpdateTabAgent: (tabId: string, agentId: string) => void
  onUpdateSessionAgent: (agentId: string) => void
  activeTabId: string | null
  activeChatSessionId?: string
  onContainerStatusUpdate: (status: string, error?: string) => void
}

const MAX_MESSAGE_QUEUE_SIZE = 10

export function useClaudeAgent({
  agentId,
  workingDir,
  useDocker,
  onUserMessage,
  onUpdateTabAgent,
  onUpdateSessionAgent,
  activeTabId,
  activeChatSessionId,
  onContainerStatusUpdate
}: UseClaudeAgentOptions) {
  const { state: agentStatusState, actions: agentStatusActions } = useAgentStatus()
  const [messageQueue, setMessageQueue] = useState<Array<string | MessageContent[]>>([])
  const currentAgentIdRef = useRef<string | undefined>(agentId)
  const lastAssistantMessageIdRef = useRef<string | null>(null)

  // Store actions
  const addMessage = useClaudeChatStore((state) => state.addMessage)
  const updateMessage = useClaudeChatStore((state) => state.updateMessage)
  const appendToLastMessage = useClaudeChatStore((state) => state.appendToLastMessage)
  const addTokenUsage = useClaudeChatStore((state) => state.addTokenUsage)
  const clearMessages = useClaudeChatStore((state) => state.clearMessages)
  const getMessages = useClaudeChatStore((state) => state.getMessages)

  // Sync currentAgentIdRef with prop changes and reset status when switching agents
  useEffect(() => {
    // If agentId is changing to a different agent, reset the status
    if (currentAgentIdRef.current && agentId && currentAgentIdRef.current !== agentId) {
      console.log('[useClaudeAgent] Agent ID changed, resetting status')
      agentStatusActions.reset()
      agentStatusActions.setError(null)
    }
    currentAgentIdRef.current = agentId
  }, [agentId, agentStatusActions])

  // Initialize agent (lazy initialization on first message)
  const initializeAgent = useCallback(async (): Promise<string | null> => {
    console.log('[useClaudeAgent] Initializing agent...')
    agentStatusActions.startInitializing()
    agentStatusActions.setError(null)

    // Set initial container status based on Docker mode
    if (useDocker) {
      onContainerStatusUpdate('building')
    } else {
      onContainerStatusUpdate('disabled')
    }

    try {
      const result = await window.electron.claude.start(workingDir, undefined, useDocker)

      if (result.success && result.agentId) {
        console.log('[useClaudeAgent] Agent initialized:', result.agentId)

        // Update the tab with the new agent ID (for backwards compatibility)
        if (activeTabId) {
          onUpdateTabAgent(activeTabId, result.agentId)
        }

        // Update the chat session with the new agent ID
        if (activeChatSessionId) {
          onUpdateSessionAgent(result.agentId)
        }

        // Update ref
        currentAgentIdRef.current = result.agentId

        return result.agentId
      } else {
        console.error('[useClaudeAgent] Failed to initialize agent:', result.error)
        agentStatusActions.setError(result.error || 'Failed to start agent')
        return null
      }
    } catch (err) {
      console.error('[useClaudeAgent] Exception initializing agent:', err)
      agentStatusActions.setError(err instanceof Error ? err.message : 'Failed to start agent')
      return null
    } finally {
      agentStatusActions.finishInitializing()
    }
  }, [
    workingDir,
    useDocker,
    onUpdateTabAgent,
    onUpdateSessionAgent,
    activeTabId,
    activeChatSessionId,
    onContainerStatusUpdate,
    agentStatusActions
  ])

  // Restart agent with new Docker mode
  const restartAgent = useCallback(
    async (newDockerMode: boolean): Promise<string | null> => {
      console.log('[useClaudeAgent] Restarting agent with Docker:', newDockerMode)
      agentStatusActions.startInitializing()

      // Set container status based on new mode
      if (newDockerMode) {
        onContainerStatusUpdate('building')
      } else {
        onContainerStatusUpdate('disabled')
      }

      try {
        const result = await window.electron.claude.start(workingDir, undefined, newDockerMode)

        if (result.success && result.agentId) {
          console.log('[useClaudeAgent] Agent restarted:', result.agentId)

          // Update agent ID reference IMMEDIATELY to catch early events
          currentAgentIdRef.current = result.agentId

          return result.agentId
        } else {
          console.error('[useClaudeAgent] Failed to restart agent:', result.error)
          agentStatusActions.setError(result.error || 'Failed to restart agent')
          onContainerStatusUpdate('error', result.error)
          return null
        }
      } catch (err) {
        console.error('[useClaudeAgent] Exception restarting agent:', err)
        const errorMessage = err instanceof Error ? err.message : 'Failed to restart agent'
        agentStatusActions.setError(errorMessage)
        onContainerStatusUpdate('error', errorMessage)
        return null
      } finally {
        agentStatusActions.finishInitializing()
      }
    },
    [workingDir, onContainerStatusUpdate, agentStatusActions]
  )

  // IPC Event Listeners (use refs to avoid re-creating listeners on every dependency change)
  const onContainerStatusUpdateRef = useRef(onContainerStatusUpdate)
  const agentStatusActionsRef = useRef(agentStatusActions)
  const agentStatusStateRef = useRef(agentStatusState)

  useEffect(() => {
    onContainerStatusUpdateRef.current = onContainerStatusUpdate
    agentStatusActionsRef.current = agentStatusActions
    agentStatusStateRef.current = agentStatusState
  })

  useEffect(() => {
    if (!agentId) return

    console.log('[useClaudeAgent] Setting up IPC listeners for agent:', agentId)

    // Listen for text responses from Claude
    const unlistenText = window.electron.claude.onText((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Received text:', data.text)

      // Append to last assistant message or create new one
      const currentMessages = getMessages(data.agentId)
      const lastMessage = currentMessages[currentMessages.length - 1]

      if (lastMessage && lastMessage.role === 'assistant' && typeof lastMessage.content === 'string') {
        // Append to existing message
        const updated = appendToLastMessage(data.agentId, data.text)
        if (updated) {
          lastAssistantMessageIdRef.current = updated.id
        }
      } else {
        // Create new assistant message
        const newId = generateId.message()
        lastAssistantMessageIdRef.current = newId
        addMessage(data.agentId, {
          id: newId,
          role: 'assistant',
          content: data.text
        })
      }
    })

    // Listen for status changes
    const unlistenStatus = window.electron.claude.onStatus((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Status changed:', data.status)
      agentStatusActionsRef.current.setWorking(data.status === 'working')
    })

    // Listen for token usage
    const unlistenUsage = window.electron.claude.onUsage((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Token usage:', data.usage)

      // Add token usage to store
      addTokenUsage(data.agentId, data.usage.inputTokens, data.usage.outputTokens)

      // Finalize metadata for current turn
      const now = Date.now()
      const currentMetadata = agentStatusStateRef.current.currentTurnMetadata

      if (currentMetadata) {
        // Calculate final phase time
        const phaseElapsed = now - (currentMetadata.phaseStartTime || now)
        let finalThinkingTime = currentMetadata.thinkingTime || 0
        let finalStreamingTime = currentMetadata.streamingTime || 0
        let finalToolTime = currentMetadata.toolExecutionTime || 0

        if (currentMetadata.currentPhase === 'thinking') {
          finalThinkingTime += phaseElapsed
        } else if (currentMetadata.currentPhase === 'streaming') {
          finalStreamingTime += phaseElapsed
        } else if (currentMetadata.currentPhase === 'tool_execution') {
          finalToolTime += phaseElapsed
        }

        const totalDuration = now - (currentMetadata.startTime || now)
        const finalMetadata = {
          ...currentMetadata,
          thinkingTime: finalThinkingTime,
          streamingTime: finalStreamingTime,
          toolExecutionTime: finalToolTime,
          totalDuration,
          inputTokens: data.usage.inputTokens,
          outputTokens: data.usage.outputTokens,
          isComplete: true
        }

        // Attach metadata to last assistant message
        if (lastAssistantMessageIdRef.current) {
          updateMessage(data.agentId, lastAssistantMessageIdRef.current, {
            metadata: finalMetadata
          })
        }

        // Update reducer state
        agentStatusActionsRef.current.finalizeTurn(data.usage.inputTokens, data.usage.outputTokens, now)
      }
    })

    // Listen for agent status updates (thinking, tool execution, streaming)
    const unlistenAgentStatus = window.electron.claude.onAgentStatus((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Agent status:', data.status)
      agentStatusActionsRef.current.setStatus(data.status)

      // Update metadata with phase transitions
      const now = Date.now()
      agentStatusActionsRef.current.updateTurnPhase(data.status, now)
    })

    // Listen for tool executions
    const unlistenToolExecution = window.electron.claude.onToolExecution((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Tool execution:', data.tool)
      agentStatusActionsRef.current.setTool(data.tool)
    })

    // Listen for errors
    const unlistenError = window.electron.claude.onError((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.error('[useClaudeAgent] Error:', data.error)
      agentStatusActionsRef.current.setError(data.error)
    })

    // Listen for container status changes
    const unlistenContainer = window.electron.claude.onContainerStatus((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Container status:', data.status, data.error)
      onContainerStatusUpdateRef.current(data.status, data.error)
    })

    // Listen for tool started events
    const unlistenToolStarted = window.electron.claude.onToolStarted((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Tool started:', data.toolCall)
      agentStatusActionsRef.current.addToolCall(data.toolCall)
    })

    // Listen for tool completed events
    const unlistenToolCompleted = window.electron.claude.onToolCompleted((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Tool completed:', data.toolCall)
      agentStatusActionsRef.current.updateToolCall(data.toolCall)
    })

    // Listen for quest prompts (agent asking questions)
    const unlistenQuestPrompt = window.electron.claude.onQuestPrompt((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Quest prompt received:', data.questId, data.prompt)

      // Create a message with the quest prompt
      addMessage(data.agentId, {
        id: data.questId,
        role: 'assistant',
        content: data.prompt.question || '',
        questPrompt: data.prompt,
        metadata: { isComplete: false },
        timestamp: Date.now()
      })
    })

    return () => {
      unlistenText()
      unlistenStatus()
      unlistenUsage()
      unlistenAgentStatus()
      unlistenToolExecution()
      unlistenError()
      unlistenContainer()
      unlistenToolStarted()
      unlistenToolCompleted()
      unlistenQuestPrompt()
    }
  }, [agentId, addMessage, updateMessage, appendToLastMessage, addTokenUsage, getMessages]) // Simplified dependencies

  // Send message internal implementation
  const sendMessageInternal = useCallback(
    async (content: string | MessageContent[]) => {
      console.log(
        '[useClaudeAgent] Sending content:',
        typeof content === 'string' ? content : `[${content.length} blocks]`
      )

      // Ensure we have an agent ID
      const activeAgentId = currentAgentIdRef.current
      if (!activeAgentId) {
        console.error('[useClaudeAgent] No agent ID available')
        agentStatusActions.setError('Agent not initialized')
        return
      }

      // Clear any previous error
      agentStatusActions.setError(null)

      // Clear active tool calls from previous turn
      agentStatusActions.clearToolCalls()

      // Start tracking new turn
      agentStatusActions.startTurn()

      // Add user message to store
      addMessage(activeAgentId, {
        id: generateId.message(),
        role: 'user',
        content: content
      })

      // Set working state
      agentStatusActions.setWorking(true)

      // Send to agent
      try {
        const result = await window.electron.claude.send(activeAgentId, content)
        if (!result.success) {
          agentStatusActions.setError(result.error || 'Failed to send message')
        }
      } catch (err) {
        console.error('[useClaudeAgent] Failed to send:', err)
        agentStatusActions.setError('Failed to send message')
      }
    },
    [agentStatusActions, addMessage]
  )

  // Public send message handler
  const handleSend = useCallback(
    async (content: string | MessageContent[]) => {
      // Notify parent that user sent a message (to dismiss welcome overlay)
      onUserMessage?.()

      // If agent not initialized yet, initialize it first (lazy initialization)
      if (!currentAgentIdRef.current && !agentStatusState.isInitializingAgent) {
        console.log('[useClaudeAgent] Agent not initialized, starting it now...')
        const newAgentId = await initializeAgent()

        if (!newAgentId) {
          // Agent failed to initialize, error already set
          return
        }
      }

      // If already working or initializing, queue the message instead
      if (agentStatusState.isWorking || agentStatusState.isInitializingAgent) {
        console.log('[useClaudeAgent] Agent busy/initializing, queueing message')
        setMessageQueue((prev) => {
          const newQueue = [...prev, content]
          // Keep only the last MAX_MESSAGE_QUEUE_SIZE messages to prevent unbounded growth
          return newQueue.slice(-MAX_MESSAGE_QUEUE_SIZE)
        })
        return
      }

      await sendMessageInternal(content)
    },
    [
      agentStatusState.isWorking,
      agentStatusState.isInitializingAgent,
      sendMessageInternal,
      onUserMessage,
      initializeAgent
    ]
  )

  // Process queued messages when agent becomes idle
  useEffect(() => {
    if (!agentStatusState.isWorking && messageQueue.length > 0) {
      const [nextMessage, ...remainingQueue] = messageQueue
      console.log('[useClaudeAgent] Agent idle, processing queued message:', nextMessage)
      setMessageQueue(remainingQueue)
      // Delay before processing queued messages to ensure clean state
      setTimeout(() => sendMessageInternal(nextMessage), TIMING.MESSAGE_QUEUE_DELAY)
    }
  }, [agentStatusState.isWorking, messageQueue, sendMessageInternal])

  // Helper to add system messages
  const addSystemMessage = useCallback(
    (content: string) => {
      const activeAgentId = currentAgentIdRef.current
      if (!activeAgentId) return

      addMessage(activeAgentId, {
        id: generateId.message(),
        role: 'system',
        content
      })
    },
    [addMessage]
  )

  // Handle quest prompt responses
  const handleQuestResponse = useCallback(
    async (questId: string, response: string | string[]) => {
      const activeAgentId = currentAgentIdRef.current
      if (!activeAgentId) {
        console.error('[useClaudeAgent] No agent ID for quest response')
        return
      }

      console.log('[useClaudeAgent] Quest response:', questId, response)

      // Update the quest message with the response
      updateMessage(activeAgentId, questId, {
        questResponse: response,
        metadata: { isComplete: true }
      })

      try {
        // Send response to agent
        const result = await window.electron.claude.respondToQuest(
          activeAgentId,
          questId,
          response
        )

        if (!result.success) {
          console.error('[useClaudeAgent] Failed to send quest response:', result.error)
          agentStatusActions.setError(result.error || 'Failed to send response')
        }
      } catch (err) {
        console.error('[useClaudeAgent] Exception sending quest response:', err)
        agentStatusActions.setError('Failed to send response')
      }
    },
    [updateMessage, agentStatusActions]
  )

  return {
    // State
    currentAgentId: currentAgentIdRef.current,
    isWorking: agentStatusState.isWorking,
    isInitializingAgent: agentStatusState.isInitializingAgent,
    agentStatus: agentStatusState.agentStatus,
    currentTool: agentStatusState.currentTool,
    error: agentStatusState.error,
    currentTurnMetadata: agentStatusState.currentTurnMetadata,
    activeToolCalls: agentStatusState.activeToolCalls,

    // Actions
    initializeAgent,
    restartAgent,
    sendMessage: handleSend,
    addSystemMessage,
    respondToQuest: handleQuestResponse,
    clearMessages: (agentId: string) => clearMessages(agentId),
    getMessages: (agentId: string) => getMessages(agentId)
  }
}
