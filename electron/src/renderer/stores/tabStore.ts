import { create } from 'zustand'
import { generateId } from '../../shared/utils/id'

export type TabType = 'terminal' | 'claude-chat'

export interface Tab {
  id: string
  title: string
  isActive: boolean
  type: TabType
  agentId?: string // For Claude chat tabs
  workingDir?: string // For Claude chat tabs
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
  getActiveTab: () => Tab | undefined
  getTabByIndex: (index: number) => Tab | undefined
}

let tabCounter = 0

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  createTab: (options: CreateTabOptions = {}) => {
    const { type = 'terminal', agentId, workingDir } = options
    const id = generateId.tab()
    tabCounter++

    const newTab: Tab = {
      id,
      title: type === 'claude-chat' ? `Claude ${tabCounter}` : `Shell ${tabCounter}`,
      isActive: true,
      type,
      ...(agentId && { agentId }),
      ...(workingDir && { workingDir }),
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

  getActiveTab: () => {
    const state = get()
    return state.tabs.find((tab) => tab.id === state.activeTabId)
  },

  getTabByIndex: (index: number) => {
    const state = get()
    return state.tabs[index]
  },
}))
