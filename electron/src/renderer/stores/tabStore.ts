import { create } from 'zustand'
import { generateId } from '../../shared/utils/id'

export type TabType = 'terminal' | 'claude-chat'

export interface ChatSession {
  id: string
  title: string
  agentId?: string // Optional - set after agent is initialized
  createdAt: number
  lastActive: number
}

export interface Tab {
  id: string
  title: string
  isActive: boolean
  type: TabType
  agentId?: string // For Claude chat tabs (deprecated, use chatSessions)
  workingDir?: string // For Claude chat tabs
  chatSessions?: ChatSession[] // Multiple chat sessions per tab
  activeChatSessionId?: string | null // Currently active chat session
}

export interface CreateTabOptions {
  type?: TabType
  agentId?: string
  workingDir?: string
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null

  // Actions
  createTab: (options?: CreateTabOptions) => string
  createClaudeTab: (agentId: string, workingDir: string) => string // Kept for backwards compatibility
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabTitle: (id: string, title: string) => void
  updateTabAgent: (id: string, agentId: string) => void
  getActiveTab: () => Tab | undefined
  getTabByIndex: (index: number) => Tab | undefined

  // Chat session actions
  createChatSession: (tabId: string) => string
  closeChatSession: (tabId: string, sessionId: string) => void
  setActiveChatSession: (tabId: string, sessionId: string) => void
  updateChatSessionTitle: (tabId: string, sessionId: string, title: string) => void
  updateChatSessionAgent: (tabId: string, sessionId: string, agentId: string) => void
  getActiveChatSession: (tabId: string) => ChatSession | undefined
}

let tabCounter = 0

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  createTab: (options: CreateTabOptions = {}) => {
    const { type = 'terminal', agentId, workingDir } = options
    const id = generateId.tab()
    tabCounter++

    // Format directory title (last 2 segments)
    let title = type === 'claude-chat' ? `Claude ${tabCounter}` : `Shell ${tabCounter}`
    if (type === 'claude-chat' && workingDir) {
      const parts = workingDir.split('/').filter(Boolean)
      title = parts.slice(-2).join('/')
    }

    // Create initial chat session for claude-chat tabs
    const chatSessions: ChatSession[] = []
    let activeChatSessionId: string | null = null

    if (type === 'claude-chat') {
      const sessionId = generateId.tab()
      chatSessions.push({
        id: sessionId,
        title: 'Chat 1',
        agentId: agentId, // Will be set after agent initialization (unless explicitly provided)
        createdAt: Date.now(),
        lastActive: Date.now()
      })
      activeChatSessionId = sessionId
    }

    const newTab: Tab = {
      id,
      title,
      isActive: true,
      type,
      ...(agentId && { agentId }),
      ...(workingDir && { workingDir }),
      chatSessions,
      activeChatSessionId,
    }

    set((state) => ({
      tabs: [
        ...state.tabs.map((tab) => ({ ...tab, isActive: false })),
        newTab,
      ],
      activeTabId: id,
    }))

    return id
  },

  // Kept for backwards compatibility - delegates to createTab
  createClaudeTab: (agentId: string, workingDir: string) => {
    return get().createTab({ type: 'claude-chat', agentId, workingDir })
  },

  closeTab: (id: string) => {
    const state = get()
    const tabIndex = state.tabs.findIndex((tab) => tab.id === id)

    if (tabIndex === -1) return

    const newTabs = state.tabs.filter((tab) => tab.id !== id)

    // If closing the active tab, activate another tab
    let newActiveTabId = state.activeTabId

    if (id === state.activeTabId && newTabs.length > 0) {
      // Activate the tab to the left, or the first tab if we closed the first tab
      const newActiveIndex = Math.max(0, tabIndex - 1)
      newActiveTabId = newTabs[newActiveIndex]?.id || null

      newTabs.forEach((tab, i) => {
        tab.isActive = i === newActiveIndex
      })
    }

    set({
      tabs: newTabs,
      activeTabId: newActiveTabId,
    })
  },

  setActiveTab: (id: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => ({
        ...tab,
        isActive: tab.id === id,
      })),
      activeTabId: id,
    }))
  },

  updateTabTitle: (id: string, title: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, title } : tab
      ),
    }))
  },

  updateTabAgent: (id: string, agentId: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, agentId } : tab
      ),
    }))
  },

  getActiveTab: () => {
    const state = get()
    return state.tabs.find((tab) => tab.id === state.activeTabId)
  },

  getTabByIndex: (index: number) => {
    const state = get()
    return state.tabs[index]
  },

  createChatSession: (tabId: string) => {
    const sessionId = generateId.tab()

    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab

        const chatSessions = tab.chatSessions || []
        const sessionNumber = chatSessions.length + 1
        const newSession: ChatSession = {
          id: sessionId,
          title: `Chat ${sessionNumber}`,
          agentId: undefined, // Will be set after agent initialization
          createdAt: Date.now(),
          lastActive: Date.now()
        }

        return {
          ...tab,
          chatSessions: [...chatSessions, newSession],
          activeChatSessionId: sessionId,
        }
      }),
    }))

    return sessionId
  },

  closeChatSession: (tabId: string, sessionId: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab

        const chatSessions = tab.chatSessions || []
        const sessionIndex = chatSessions.findIndex((s) => s.id === sessionId)
        if (sessionIndex === -1) return tab

        const newSessions = chatSessions.filter((s) => s.id !== sessionId)

        // If closing the active session, activate another
        let newActiveSessionId = tab.activeChatSessionId
        if (sessionId === tab.activeChatSessionId && newSessions.length > 0) {
          const newActiveIndex = Math.max(0, sessionIndex - 1)
          newActiveSessionId = newSessions[newActiveIndex]?.id || null
        }

        return {
          ...tab,
          chatSessions: newSessions,
          activeChatSessionId: newActiveSessionId,
        }
      }),
    }))
  },

  setActiveChatSession: (tabId: string, sessionId: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab

        const chatSessions = tab.chatSessions || []
        // Update lastActive timestamp
        return {
          ...tab,
          activeChatSessionId: sessionId,
          chatSessions: chatSessions.map((s) =>
            s.id === sessionId ? { ...s, lastActive: Date.now() } : s
          ),
        }
      }),
    }))
  },

  updateChatSessionTitle: (tabId: string, sessionId: string, title: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab

        const chatSessions = tab.chatSessions || []
        return {
          ...tab,
          chatSessions: chatSessions.map((s) =>
            s.id === sessionId ? { ...s, title } : s
          ),
        }
      }),
    }))
  },

  updateChatSessionAgent: (tabId: string, sessionId: string, agentId: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab

        const chatSessions = tab.chatSessions || []
        return {
          ...tab,
          chatSessions: chatSessions.map((s) =>
            s.id === sessionId ? { ...s, agentId } : s
          ),
        }
      }),
    }))
  },

  getActiveChatSession: (tabId: string) => {
    const state = get()
    const tab = state.tabs.find((t) => t.id === tabId)
    if (!tab || !tab.activeChatSessionId || !tab.chatSessions) return undefined
    return tab.chatSessions.find((s) => s.id === tab.activeChatSessionId)
  },
}))
