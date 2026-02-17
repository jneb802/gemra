import { create } from 'zustand'
import { generateId } from '../../shared/utils/id'

export type TabType = 'agent-chat' | 'terminal'

export interface TerminalSession {
  id: string
  title: string
  terminalId: string
  workingDir: string
  createdAt: number
  lastActive: number
}

export interface Tab {
  id: string
  title: string
  isActive: boolean
  type: TabType
  workingDir: string

  // agent-chat only
  agentId?: string
  subTerminals?: TerminalSession[]
  activeSubTerminalId?: string | null  // null = viewing chat

  // standalone terminal only
  terminalId?: string
}

export interface CreateTabOptions {
  type?: TabType
  agentId?: string
  workingDir?: string
  terminalId?: string
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

  // Sub-terminal actions (for agent-chat tabs)
  addSubTerminal: (tabId: string, workingDir: string) => string
  closeSubTerminal: (tabId: string, terminalSessionId: string) => void
  setActiveSubTerminal: (tabId: string, id: string | null) => void
  getActiveSubTerminal: (tabId: string) => TerminalSession | undefined
}

let agentChatCounter = 0
let terminalCounter = 0

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  createTab: (options: CreateTabOptions = {}) => {
    const { type = 'agent-chat', agentId, workingDir, terminalId } = options
    const id = generateId.tab()

    let newTab: Tab

    if (type === 'agent-chat') {
      agentChatCounter++
      newTab = {
        id,
        title: `Claude ${agentChatCounter}`,
        isActive: true,
        type: 'agent-chat',
        workingDir: workingDir || '',
        ...(agentId && { agentId }),
        subTerminals: [],
        activeSubTerminalId: null,
      }
    } else {
      terminalCounter++
      const tId = terminalId || generateId.tab()
      newTab = {
        id,
        title: `Terminal ${terminalCounter}`,
        isActive: true,
        type: 'terminal',
        workingDir: workingDir || '',
        terminalId: tId,
      }
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
    return get().createTab({ type: 'agent-chat', agentId, workingDir })
  },

  closeTab: (id: string) => {
    const state = get()
    const tabIndex = state.tabs.findIndex((tab) => tab.id === id)

    if (tabIndex === -1) return

    const newTabs = state.tabs.filter((tab) => tab.id !== id)
    let newActiveTabId = state.activeTabId

    if (id === state.activeTabId && newTabs.length > 0) {
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

  addSubTerminal: (tabId: string, workingDir: string) => {
    const sessionId = generateId.tab()
    const terminalId = generateId.tab()

    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId || tab.type !== 'agent-chat') return tab

        const subTerminals = tab.subTerminals || []
        const sessionNumber = subTerminals.length + 1
        const newSession: TerminalSession = {
          id: sessionId,
          title: `Terminal ${sessionNumber}`,
          terminalId,
          workingDir,
          createdAt: Date.now(),
          lastActive: Date.now(),
        }

        return {
          ...tab,
          subTerminals: [...subTerminals, newSession],
          activeSubTerminalId: sessionId,
        }
      }),
    }))

    return sessionId
  },

  closeSubTerminal: (tabId: string, terminalSessionId: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId || tab.type !== 'agent-chat') return tab

        const subTerminals = tab.subTerminals || []
        const newSubTerminals = subTerminals.filter((s) => s.id !== terminalSessionId)

        // If closing the active sub-terminal, revert to chat (null)
        const newActiveSubTerminalId =
          tab.activeSubTerminalId === terminalSessionId ? null : tab.activeSubTerminalId

        return {
          ...tab,
          subTerminals: newSubTerminals,
          activeSubTerminalId: newActiveSubTerminalId,
        }
      }),
    }))
  },

  setActiveSubTerminal: (tabId: string, id: string | null) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId || tab.type !== 'agent-chat') return tab

        const subTerminals = tab.subTerminals || []
        return {
          ...tab,
          activeSubTerminalId: id,
          subTerminals: id
            ? subTerminals.map((s) =>
                s.id === id ? { ...s, lastActive: Date.now() } : s
              )
            : subTerminals,
        }
      }),
    }))
  },

  getActiveSubTerminal: (tabId: string) => {
    const state = get()
    const tab = state.tabs.find((t) => t.id === tabId)
    if (!tab || tab.type !== 'agent-chat' || !tab.activeSubTerminalId || !tab.subTerminals) {
      return undefined
    }
    return tab.subTerminals.find((s) => s.id === tab.activeSubTerminalId)
  },
}))
