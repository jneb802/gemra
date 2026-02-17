import { create } from 'zustand'
import type { ClaudeMessage } from '../../shared/types'

/**
 * Per-agent persistent state for Claude chat sessions
 * Survives component remounts, organized by agentId
 */

interface AgentConfig {
  mode: 'default' | 'acceptEdits' | 'plan'
  model: string
}

interface AgentTokenUsage {
  inputTokens: number
  outputTokens: number
}

interface ClaudeChatState {
  // State per agent ID
  messages: Map<string, ClaudeMessage[]>
  tokenUsage: Map<string, AgentTokenUsage>
  agentConfig: Map<string, AgentConfig>

  // Actions
  addMessage: (agentId: string, message: ClaudeMessage) => void
  updateMessage: (agentId: string, messageId: string, updates: Partial<ClaudeMessage>) => void
  appendToLastMessage: (agentId: string, text: string) => ClaudeMessage | null
  clearMessages: (agentId: string) => void
  getMessages: (agentId: string) => ClaudeMessage[]

  addTokenUsage: (agentId: string, inputTokens: number, outputTokens: number) => void
  getTokenUsage: (agentId: string) => AgentTokenUsage

  setAgentConfig: (agentId: string, config: Partial<AgentConfig>) => void
  getAgentConfig: (agentId: string) => AgentConfig

  removeAgent: (agentId: string) => void
  cleanupOldAgents: (activeAgentIds: string[]) => void
}

const DEFAULT_CONFIG: AgentConfig = {
  mode: 'default',
  model: 'sonnet'
}

const DEFAULT_TOKEN_USAGE: AgentTokenUsage = {
  inputTokens: 0,
  outputTokens: 0
}

export const useClaudeChatStore = create<ClaudeChatState>((set, get) => ({
  messages: new Map(),
  tokenUsage: new Map(),
  agentConfig: new Map(),

  addMessage: (agentId: string, message: ClaudeMessage) => {
    set((state) => {
      const messages = new Map(state.messages)
      const agentMessages = messages.get(agentId) || []
      messages.set(agentId, [...agentMessages, message])
      return { messages }
    })
  },

  updateMessage: (agentId: string, messageId: string, updates: Partial<ClaudeMessage>) => {
    set((state) => {
      const messages = new Map(state.messages)
      const agentMessages = messages.get(agentId) || []
      messages.set(
        agentId,
        agentMessages.map((msg) =>
          msg.id === messageId ? { ...msg, ...updates } : msg
        )
      )
      return { messages }
    })
  },

  appendToLastMessage: (agentId: string, text: string) => {
    let updatedMessage: ClaudeMessage | null = null

    set((state) => {
      const messages = new Map(state.messages)
      const agentMessages = messages.get(agentId) || []

      if (agentMessages.length === 0) {
        return state
      }

      const lastMessage = agentMessages[agentMessages.length - 1]

      // Only append if it's a string content
      if (typeof lastMessage.content === 'string') {
        updatedMessage = {
          ...lastMessage,
          content: lastMessage.content + text
        }

        messages.set(
          agentId,
          [...agentMessages.slice(0, -1), updatedMessage]
        )
        return { messages }
      }

      return state
    })

    return updatedMessage
  },

  clearMessages: (agentId: string) => {
    set((state) => {
      const messages = new Map(state.messages)
      messages.delete(agentId)
      return { messages }
    })
  },

  getMessages: (agentId: string) => {
    return get().messages.get(agentId) || []
  },

  addTokenUsage: (agentId: string, inputTokens: number, outputTokens: number) => {
    set((state) => {
      const tokenUsage = new Map(state.tokenUsage)
      const current = tokenUsage.get(agentId) || { ...DEFAULT_TOKEN_USAGE }
      tokenUsage.set(agentId, {
        inputTokens: current.inputTokens + inputTokens,
        outputTokens: current.outputTokens + outputTokens
      })
      return { tokenUsage }
    })
  },

  getTokenUsage: (agentId: string) => {
    return get().tokenUsage.get(agentId) || { ...DEFAULT_TOKEN_USAGE }
  },

  setAgentConfig: (agentId: string, config: Partial<AgentConfig>) => {
    set((state) => {
      const agentConfig = new Map(state.agentConfig)
      const current = agentConfig.get(agentId) || { ...DEFAULT_CONFIG }
      agentConfig.set(agentId, { ...current, ...config })
      return { agentConfig }
    })
  },

  getAgentConfig: (agentId: string) => {
    return get().agentConfig.get(agentId) || { ...DEFAULT_CONFIG }
  },

  removeAgent: (agentId: string) => {
    set((state) => {
      const messages = new Map(state.messages)
      const tokenUsage = new Map(state.tokenUsage)
      const agentConfig = new Map(state.agentConfig)

      messages.delete(agentId)
      tokenUsage.delete(agentId)
      agentConfig.delete(agentId)

      return { messages, tokenUsage, agentConfig }
    })
  },

  // Cleanup old agents to prevent memory leaks
  cleanupOldAgents: (activeAgentIds: string[]) => {
    set((state) => {
      const messages = new Map(state.messages)
      const tokenUsage = new Map(state.tokenUsage)
      const agentConfig = new Map(state.agentConfig)

      const activeSet = new Set(activeAgentIds)

      // Remove agents that are no longer active
      for (const agentId of messages.keys()) {
        if (!activeSet.has(agentId)) {
          messages.delete(agentId)
          tokenUsage.delete(agentId)
          agentConfig.delete(agentId)
        }
      }

      return { messages, tokenUsage, agentConfig }
    })
  }
}))
