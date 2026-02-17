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
  activeTabId: string | null
  onContainerStatusUpdate: (status: string, error?: string) => void
}

export function useClaudeAgent({
  agentId,
  workingDir,
  useDocker,
  onUserMessage,
  onUpdateTabAgent,
  activeTabId,
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

  // Sync currentAgentIdRef with prop changes
  useEffect(() => {
    currentAgentIdRef.current = agentId
  }, [agentId])

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

        // Update the tab with the new agent ID
        if (activeTabId) {
          onUpdateTabAgent(activeTabId, result.agentId)
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
    activeTabId,
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

  // IPC Event Listeners
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
      agentStatusActions.setWorking(data.status === 'working')
    })

    // Listen for token usage
    const unlistenUsage = window.electron.claude.onUsage((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Token usage:', data.usage)

      // Add token usage to store
      addTokenUsage(data.agentId, data.usage.inputTokens, data.usage.outputTokens)

      // Finalize metadata for current turn
      const now = Date.now()
      agentStatusActions.finalizeTurn(data.usage.inputTokens, data.usage.outputTokens, now)

      // Attach metadata to last assistant message
      if (lastAssistantMessageIdRef.current && agentStatusState.currentTurnMetadata) {
        updateMessage(data.agentId, lastAssistantMessageIdRef.current, {
          metadata: agentStatusState.currentTurnMetadata
        })
      }
    })

    // Listen for agent status updates (thinking, tool execution, streaming)
    const unlistenAgentStatus = window.electron.claude.onAgentStatus((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Agent status:', data.status)
      agentStatusActions.setStatus(data.status)

      // Update metadata with phase transitions
      const now = Date.now()
      agentStatusActions.updateTurnPhase(data.status, now)
    })

    // Listen for tool executions
    const unlistenToolExecution = window.electron.claude.onToolExecution((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Tool execution:', data.tool)
      agentStatusActions.setTool(data.tool)
    })

    // Listen for errors
    const unlistenError = window.electron.claude.onError((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.error('[useClaudeAgent] Error:', data.error)
      agentStatusActions.setError(data.error)
    })

    // Listen for container status changes
    const unlistenContainer = window.electron.claude.onContainerStatus((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Container status:', data.status, data.error)
      onContainerStatusUpdate(data.status, data.error)
    })

    // Listen for tool started events
    const unlistenToolStarted = window.electron.claude.onToolStarted((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Tool started:', data.toolCall)
      agentStatusActions.addToolCall(data.toolCall)
    })

    // Listen for tool completed events
    const unlistenToolCompleted = window.electron.claude.onToolCompleted((data) => {
      if (data.agentId !== currentAgentIdRef.current) return

      console.log('[useClaudeAgent] Tool completed:', data.toolCall)
      agentStatusActions.updateToolCall(data.toolCall)
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
    }
  }, [
    agentId,
    agentStatusActions,
    addMessage,
    updateMessage,
    appendToLastMessage,
    addTokenUsage,
    getMessages,
    onContainerStatusUpdate,
    agentStatusState.currentTurnMetadata
  ])

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
        setMessageQueue((prev) => [...prev, content])
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
    clearMessages: (agentId: string) => clearMessages(agentId),
    getMessages: (agentId: string) => getMessages(agentId)
  }
}
