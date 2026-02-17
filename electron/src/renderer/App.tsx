import { useEffect, useCallback, useState } from 'react'
import { TabBar } from './components/Tabs/TabBar'
import { TerminalView } from './components/Terminal/TerminalView'
import { ClaudeChat } from './components/claude/ClaudeChat'
import { PreferencesModal } from './components/Preferences/PreferencesModal'
import { CreateProjectModal } from './components/Welcome/CreateProjectModal'
import { CloneRepositoryModal } from './components/Welcome/CloneRepositoryModal'
import { ToastContainer } from './components/Toast/ToastContainer'
import { useTabStore } from './stores/tabStore'
import { useSettingsStore } from './stores/settingsStore'
import { useInputModeStore } from './stores/inputModeStore'
import { useRecentStore } from './stores/recentStore'
import { useClaudeChatStore } from './stores/claudeChatStore'
import { useBlockStore } from './stores/blockStore'
import { usePlatform } from './hooks/usePlatform'
import { TIMING } from '../shared/constants'
import * as path from 'path'

function App() {
  const tabs = useTabStore((state) => state.tabs)
  const activeTabId = useTabStore((state) => state.activeTabId)
  const createTab = useTabStore((state) => state.createTab)
  const createClaudeTab = useTabStore((state) => state.createClaudeTab)
  const closeTab = useTabStore((state) => state.closeTab)
  const setActiveTab = useTabStore((state) => state.setActiveTab)
  const getTabByIndex = useTabStore((state) => state.getTabByIndex)

  const { isMac, getModifierKey } = usePlatform()
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCloneModal, setShowCloneModal] = useState(false)
  const useDocker = useSettingsStore((state) => state.useDocker)
  const cycleMode = useInputModeStore((state) => state.cycleMode)
  const addRecent = useRecentStore((state) => state.addRecent)
  const recentItems = useRecentStore((state) => state.getRecent())

  // Periodic cleanup of old agents to prevent memory leaks
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      // Collect all active agent IDs from tabs and chat sessions
      const activeAgentIds = new Set<string>()

      tabs.forEach(tab => {
        if (tab.type === 'claude-chat') {
          if (tab.agentId) {
            activeAgentIds.add(tab.agentId)
          }
          tab.chatSessions?.forEach(session => {
            if (session.agentId) {
              activeAgentIds.add(session.agentId)
            }
          })
        }
      })

      // Cleanup agents that are no longer in any tab
      useClaudeChatStore.getState().cleanupOldAgents(Array.from(activeAgentIds))
    }, 60000) // Cleanup every minute

    return () => clearInterval(cleanupInterval)
  }, [tabs])

  // Handler for closing tabs with agent cleanup
  const handleCloseTab = useCallback(async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId)

    // Stop Claude agent if it's a claude-chat tab
    if (tab?.type === 'claude-chat') {
      // Stop and cleanup deprecated agentId
      if (tab.agentId) {
        try {
          await window.electron.claude.stop(tab.agentId)
          useClaudeChatStore.getState().removeAgent(tab.agentId)
          console.log(`Stopped agent ${tab.agentId} for tab ${tabId}`)
        } catch (error) {
          console.error('Failed to stop agent:', error)
        }
      }

      // Stop and cleanup all chat session agents and terminal PTYs
      if (tab.chatSessions) {
        for (const session of tab.chatSessions) {
          if (session.type === 'chat' && session.agentId) {
            try {
              await window.electron.claude.stop(session.agentId)
              useClaudeChatStore.getState().removeAgent(session.agentId)
              console.log(`Stopped agent ${session.agentId} for session ${session.id}`)
            } catch (error) {
              console.error('Failed to stop session agent:', error)
            }
          } else if (session.type === 'terminal' && session.terminalId) {
            try {
              await window.electron.pty.kill(session.terminalId)
              useBlockStore.getState().clearBlocks(session.terminalId)
              console.log(`Killed PTY ${session.terminalId} for terminal session ${session.id}`)
            } catch (error) {
              console.error('Failed to kill PTY:', error)
            }
          }
        }
      }
    }

    // Close the tab
    closeTab(tabId)
  }, [tabs, closeTab])

  // Tab navigation helpers
  const navigateToPreviousTab = useCallback(() => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
    if (currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1].id)
    }
  }, [tabs, activeTabId, setActiveTab])

  const navigateToNextTab = useCallback(() => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
    if (currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1].id)
    }
  }, [tabs, activeTabId, setActiveTab])

  // Handler for creating Claude chat tabs
  const handleNewClaudeTab = useCallback(async (profileId?: string) => {
    // Use hardcoded working directory (renderer can't access process)
    const workingDir = '/Users/benjmarston/Develop/gemra'
    const result = await window.electron.claude.start(workingDir, profileId, useDocker)

    if (result.success && result.agentId) {
      createClaudeTab(result.agentId, workingDir)
    } else {
      console.error('Failed to start Claude agent:', result.error)
      // Show error with details
      alert(
        `Failed to start Claude Code agent.\n\n` +
        `Error: ${result.error}\n\n` +
        `Creating directory tab with terminal session instead...`
      )
      // Fallback: create claude-chat tab with terminal session
      const tabId = createTab({ type: 'claude-chat', workingDir })
      useTabStore.getState().createTerminalSession(tabId, workingDir)
    }
  }, [createClaudeTab, createTab, useDocker])

  // Handler for creating LiteLLM chat tabs
  const handleNewLiteLLMTab = useCallback(async () => {
    await handleNewClaudeTab('litellm')
  }, [handleNewClaudeTab])

  const handleNewTab = useCallback(() => {
    handleNewClaudeTab()
  }, [handleNewClaudeTab])

  // Helper to start Claude chat in a directory
  const startClaudeChatInDirectory = useCallback(async (workingDir: string) => {
    const result = await window.electron.claude.start(workingDir, undefined, useDocker)

    if (result.success && result.agentId) {
      createClaudeTab(result.agentId, workingDir)

      // Get git branch if it's a git repo
      const branchResult = await window.electron.git.getBranch(workingDir)
      const gitBranch = branchResult.success ? branchResult.branch : undefined

      // Add to recent directories
      addRecent(workingDir, gitBranch || undefined)
    } else {
      console.error('Failed to start Claude agent:', result.error)
      alert(`Failed to start Claude Code agent.\n\nError: ${result.error}`)
    }
  }, [createClaudeTab, useDocker, addRecent])

  // Create initial tab on mount with last used directory (but don't start agent yet)
  useEffect(() => {
    if (tabs.length === 0) {
      const lastUsedDir = recentItems[0]?.path || '/Users/benjmarston/Develop/gemra'
      // Create tab immediately without starting agent (lazy initialization)
      createTab({
        type: 'claude-chat',
        workingDir: lastUsedDir
        // agentId will be set when user sends first message
      })
    }
  }, []) // Only run once on mount

  // Welcome screen handlers
  const handleOpenDirectory = useCallback(async () => {
    const currentTabId = activeTabId
    const result = await window.electron.dialog.selectDirectory()
    if (result.success && result.path) {
      await startClaudeChatInDirectory(result.path)
      // Close the welcome screen tab after opening
      if (currentTabId) {
        handleCloseTab(currentTabId)
      }
    }
  }, [startClaudeChatInDirectory, activeTabId, handleCloseTab])

  const handleCreateProject = useCallback(async (name: string, location: string, initGit: boolean) => {
    const currentTabId = activeTabId
    const targetPath = path.join(location, name)

    // Create directory
    const createResult = await window.electron.dialog.createDirectory(targetPath)
    if (!createResult.success) {
      alert(`Failed to create directory: ${createResult.error}`)
      return
    }

    // Initialize git if requested
    if (initGit) {
      const gitResult = await window.electron.git.init(targetPath)
      if (!gitResult.success) {
        console.error('Failed to initialize git:', gitResult.error)
      }
    }

    // Start Claude chat in new directory
    await startClaudeChatInDirectory(targetPath)
    // Close the welcome screen tab after creating project
    if (currentTabId) {
      handleCloseTab(currentTabId)
    }
  }, [startClaudeChatInDirectory, activeTabId, handleCloseTab])

  const handleCloneRepo = useCallback(async (url: string, targetPath: string) => {
    const currentTabId = activeTabId
    const cloneResult = await window.electron.git.clone(url, targetPath)

    if (!cloneResult.success) {
      throw new Error(cloneResult.error || 'Failed to clone repository')
    }

    // Start Claude chat in cloned directory
    await startClaudeChatInDirectory(targetPath)
    // Close the welcome screen tab after cloning
    if (currentTabId) {
      handleCloseTab(currentTabId)
    }
  }, [startClaudeChatInDirectory, activeTabId, handleCloseTab])

  const handleOpenRecentDirectory = useCallback(async (dirPath: string) => {
    const currentTabId = activeTabId
    // Check if directory still exists
    const result = await window.electron.dialog.checkDirectory(dirPath)
    if (!result.success || !result.exists) {
      alert('This directory no longer exists')
      return
    }

    await startClaudeChatInDirectory(dirPath)
    // Close the welcome screen tab after opening recent
    if (currentTabId) {
      handleCloseTab(currentTabId)
    }
  }, [startClaudeChatInDirectory, activeTabId, handleCloseTab])

  // Handle menu events
  useEffect(() => {
    const unsubscribers: (() => void)[] = []

    unsubscribers.push(
      window.electron.onMenuEvent('menu:new-tab', () => handleNewClaudeTab())
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:new-litellm-chat', () => handleNewLiteLLMTab())
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:close-tab', () => {
        if (activeTabId) {
          handleCloseTab(activeTabId)
        }
      })
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:previous-tab', navigateToPreviousTab)
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:next-tab', navigateToNextTab)
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:preferences', () => setIsPreferencesOpen(true))
    )

    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [
    createTab,
    handleCloseTab,
    handleNewClaudeTab,
    handleNewLiteLLMTab,
    activeTabId,
    navigateToPreviousTab,
    navigateToNextTab,
  ])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {

      if (!getModifierKey(e)) return

      // Cmd/Ctrl+T - New Claude chat tab
      if (e.key === 't' && !e.shiftKey) {
        e.preventDefault()
        handleNewClaudeTab()
      }

      // Cmd/Ctrl+W - Close tab
      if (e.key === 'w') {
        e.preventDefault()
        if (activeTabId) {
          handleCloseTab(activeTabId)
        }
      }

      // Cmd/Ctrl+1-9 - Switch to tab by number
      const num = parseInt(e.key)
      if (num >= 1 && num <= 9) {
        e.preventDefault()
        const tab = getTabByIndex(num - 1)
        if (tab) {
          setActiveTab(tab.id)
        }
      }

      // Cmd/Ctrl+Shift+[ - Previous tab
      if (e.shiftKey && e.key === '[') {
        e.preventDefault()
        navigateToPreviousTab()
      }

      // Cmd/Ctrl+Shift+] - Next tab
      if (e.shiftKey && e.key === ']') {
        e.preventDefault()
        navigateToNextTab()
      }

      // Cmd+, - Preferences (macOS)
      if (isMac && e.key === ',') {
        e.preventDefault()
        setIsPreferencesOpen(true)
      }

      // Cmd/Ctrl+K - Cycle input mode (for Claude chat tabs)
      if (e.key === 'k') {
        e.preventDefault()
        const currentTab = tabs.find((t) => t.id === activeTabId)
        if (currentTab?.type === 'claude-chat' && currentTab.agentId) {
          cycleMode(currentTab.agentId)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isMac,
    activeTabId,
    createTab,
    handleCloseTab,
    setActiveTab,
    getTabByIndex,
    getModifierKey,
    handleNewClaudeTab,
    navigateToPreviousTab,
    navigateToNextTab,
    tabs,
    cycleMode,
  ])

  return (
    <div className="app-root">
      {/* Tab bar */}
      <TabBar onNewTab={handleNewTab} onCloseTab={handleCloseTab} />

      {/* Main content area */}
      <div className="app-content">
        {/* Terminal views - only render active tab */}
        <div className="app-terminal-container">
          {(() => {
            const activeTab = tabs.find((tab) => tab.isActive)
            if (!activeTab) return null

            return (
              <div key={activeTab.id} className="app-tab-content active">
                {activeTab.type === 'claude-chat' && activeTab.workingDir ? (
                  <ClaudeChat
                    agentId={activeTab.agentId} // Can be undefined initially
                    workingDir={activeTab.workingDir}
                    onCreateProject={() => setShowCreateModal(true)}
                    onOpenRepository={handleOpenDirectory}
                    onCloneRepository={() => setShowCloneModal(true)}
                    onOpenRecent={handleOpenRecentDirectory}
                  />
                ) : (
                  <div className="error-message">Unknown tab type: {activeTab.type}</div>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Modals */}
      <PreferencesModal isOpen={isPreferencesOpen} onClose={() => setIsPreferencesOpen(false)} />
      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateProject}
        />
      )}
      {showCloneModal && (
        <CloneRepositoryModal
          onClose={() => setShowCloneModal(false)}
          onClone={handleCloneRepo}
        />
      )}

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  )
}

export default App
