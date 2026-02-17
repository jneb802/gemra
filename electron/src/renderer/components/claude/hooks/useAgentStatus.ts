import { useReducer, useMemo } from 'react'
import type { AgentStatus, ToolExecution, ToolCall, MessageMetadata } from '../../../../shared/types'

/**
 * Reducer hook for managing live agent status state
 * Handles agent status transitions, tool tracking, and turn metadata
 */

interface AgentStatusState {
  isWorking: boolean
  isInitializingAgent: boolean
  agentStatus: AgentStatus
  currentTool: ToolExecution | null
  currentTurnMetadata: MessageMetadata | null
  error: string | null
  activeToolCalls: Map<string, ToolCall>
}

type AgentStatusAction =
  | { type: 'START_INITIALIZING' }
  | { type: 'FINISH_INITIALIZING' }
  | { type: 'SET_WORKING'; payload: boolean }
  | { type: 'SET_STATUS'; payload: AgentStatus }
  | { type: 'SET_TOOL'; payload: ToolExecution | null }
  | { type: 'START_TURN' }
  | { type: 'UPDATE_TURN_PHASE'; payload: { status: AgentStatus; now: number } }
  | { type: 'FINALIZE_TURN'; payload: { inputTokens: number; outputTokens: number; now: number } }
  | { type: 'ADD_TOOL_CALL'; payload: ToolCall }
  | { type: 'UPDATE_TOOL_CALL'; payload: ToolCall }
  | { type: 'CLEAR_TOOL_CALLS' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET' }

const initialState: AgentStatusState = {
  isWorking: false,
  isInitializingAgent: false,
  agentStatus: { type: 'idle' },
  currentTool: null,
  currentTurnMetadata: null,
  error: null,
  activeToolCalls: new Map()
}

function agentStatusReducer(state: AgentStatusState, action: AgentStatusAction): AgentStatusState {
  switch (action.type) {
    case 'START_INITIALIZING':
      return {
        ...state,
        isInitializingAgent: true,
        error: null
      }

    case 'FINISH_INITIALIZING':
      return {
        ...state,
        isInitializingAgent: false
      }

    case 'SET_WORKING':
      return {
        ...state,
        isWorking: action.payload
      }

    case 'SET_STATUS':
      return {
        ...state,
        agentStatus: action.payload
      }

    case 'SET_TOOL':
      return {
        ...state,
        currentTool: action.payload
      }

    case 'START_TURN':
      return {
        ...state,
        currentTurnMetadata: {
          startTime: Date.now(),
          currentPhase: 'thinking',
          phaseStartTime: Date.now(),
          isComplete: false,
          toolCalls: []
        },
        activeToolCalls: new Map()
      }

    case 'UPDATE_TURN_PHASE': {
      if (!state.currentTurnMetadata) return state

      const { status, now } = action.payload
      const phaseElapsed = now - (state.currentTurnMetadata.phaseStartTime || now)

      // Accumulate time from previous phase
      const updates: Partial<MessageMetadata> = {
        currentPhase: status.type,
        phaseStartTime: now
      }

      // Add accumulated time based on previous phase
      if (state.currentTurnMetadata.currentPhase === 'thinking') {
        updates.thinkingTime = (state.currentTurnMetadata.thinkingTime || 0) + phaseElapsed
      } else if (state.currentTurnMetadata.currentPhase === 'streaming') {
        updates.streamingTime = (state.currentTurnMetadata.streamingTime || 0) + phaseElapsed
      } else if (state.currentTurnMetadata.currentPhase === 'tool_execution') {
        updates.toolExecutionTime = (state.currentTurnMetadata.toolExecutionTime || 0) + phaseElapsed
      }

      return {
        ...state,
        currentTurnMetadata: { ...state.currentTurnMetadata, ...updates }
      }
    }

    case 'FINALIZE_TURN': {
      if (!state.currentTurnMetadata) return state

      const { inputTokens, outputTokens, now } = action.payload
      const phaseElapsed = now - (state.currentTurnMetadata.phaseStartTime || now)

      // Calculate final phase time
      let finalThinkingTime = state.currentTurnMetadata.thinkingTime || 0
      let finalStreamingTime = state.currentTurnMetadata.streamingTime || 0
      let finalToolTime = state.currentTurnMetadata.toolExecutionTime || 0

      if (state.currentTurnMetadata.currentPhase === 'thinking') {
        finalThinkingTime += phaseElapsed
      } else if (state.currentTurnMetadata.currentPhase === 'streaming') {
        finalStreamingTime += phaseElapsed
      } else if (state.currentTurnMetadata.currentPhase === 'tool_execution') {
        finalToolTime += phaseElapsed
      }

      const totalDuration = now - (state.currentTurnMetadata.startTime || now)

      return {
        ...state,
        currentTurnMetadata: {
          ...state.currentTurnMetadata,
          thinkingTime: finalThinkingTime,
          streamingTime: finalStreamingTime,
          toolExecutionTime: finalToolTime,
          totalDuration,
          inputTokens,
          outputTokens,
          isComplete: true
        }
      }
    }

    case 'ADD_TOOL_CALL': {
      const newToolCalls = new Map(state.activeToolCalls)
      newToolCalls.set(action.payload.id, action.payload)

      return {
        ...state,
        activeToolCalls: newToolCalls
        // Note: Tool calls are now shown as separate messages, not in metadata
      }
    }

    case 'UPDATE_TOOL_CALL': {
      const updatedToolCalls = new Map(state.activeToolCalls)
      updatedToolCalls.set(action.payload.id, action.payload)

      return {
        ...state,
        activeToolCalls: updatedToolCalls
        // Note: Tool calls are now shown as separate messages, not in metadata
      }
    }

    case 'CLEAR_TOOL_CALLS':
      return {
        ...state,
        activeToolCalls: new Map()
      }

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isWorking: action.payload ? false : state.isWorking,
        agentStatus: action.payload ? { type: 'idle' } : state.agentStatus
      }

    case 'RESET':
      return initialState

    default:
      return state
  }
}

export function useAgentStatus() {
  const [state, dispatch] = useReducer(agentStatusReducer, initialState)

  // Memoized actions for stable references
  const actions = useMemo(
    () => ({
      startInitializing: () => dispatch({ type: 'START_INITIALIZING' }),
      finishInitializing: () => dispatch({ type: 'FINISH_INITIALIZING' }),
      setWorking: (isWorking: boolean) => dispatch({ type: 'SET_WORKING', payload: isWorking }),
      setStatus: (status: AgentStatus) => dispatch({ type: 'SET_STATUS', payload: status }),
      setTool: (tool: ToolExecution | null) => dispatch({ type: 'SET_TOOL', payload: tool }),
      startTurn: () => dispatch({ type: 'START_TURN' }),
      updateTurnPhase: (status: AgentStatus, now: number) =>
        dispatch({ type: 'UPDATE_TURN_PHASE', payload: { status, now } }),
      finalizeTurn: (inputTokens: number, outputTokens: number, now: number) =>
        dispatch({ type: 'FINALIZE_TURN', payload: { inputTokens, outputTokens, now } }),
      addToolCall: (toolCall: ToolCall) => dispatch({ type: 'ADD_TOOL_CALL', payload: toolCall }),
      updateToolCall: (toolCall: ToolCall) =>
        dispatch({ type: 'UPDATE_TOOL_CALL', payload: toolCall }),
      clearToolCalls: () => dispatch({ type: 'CLEAR_TOOL_CALLS' }),
      setError: (error: string | null) => dispatch({ type: 'SET_ERROR', payload: error }),
      reset: () => dispatch({ type: 'RESET' })
    }),
    []
  )

  return { state, actions }
}
