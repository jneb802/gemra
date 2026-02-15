import { useEffect, useCallback, useState } from 'react'
import { TabBar } from './components/Tabs/TabBar'
import { TerminalView } from './components/Terminal/TerminalView'
import { ClaudeChat } from './components/claude/ClaudeChat'
import { PreferencesModal } from './components/Preferences/PreferencesModal'
import { useTabStore } from './stores/tabStore'
import { usePlatform } from './hooks/usePlatform'

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

  // Handler for closing tabs with agent cleanup
  const handleCloseTab = useCallback(async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId)

    // Stop Claude agent if it's a claude-chat tab
    if (tab?.type === 'claude-chat' && tab.agentId) {
      try {
        await window.electron.claude.stop(tab.agentId)
        console.log(`Stopped agent ${tab.agentId} for tab ${tabId}`)
      } catch (error) {
        console.error('Failed to stop agent:', error)
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
    const result = await window.electron.claude.start(workingDir, profileId)

    if (result.success && result.agentId) {
      createClaudeTab(result.agentId, workingDir)
    } else {
      console.error('Failed to start Claude agent:', result.error)
      // Show error to user (TODO: proper error handling)
      alert(`Failed to start Claude agent: ${result.error}`)
    }
  }, [createClaudeTab])

  // Handler for creating LiteLLM chat tabs
  const handleNewLiteLLMTab = useCallback(async () => {
    await handleNewClaudeTab('litellm')
  }, [handleNewClaudeTab])

  const handleNewTab = useCallback(() => {
    createTab({ type: 'terminal' })
  }, [createTab])

  // Create initial tab on mount
  useEffect(() => {
    if (tabs.length === 0) {
      handleNewClaudeTab()
    }
  }, [tabs.length, handleNewClaudeTab])

  // Handle menu events
  useEffect(() => {
    const unsubscribers: (() => void)[] = []

    unsubscribers.push(
      window.electron.onMenuEvent('menu:new-tab', () => createTab({ type: 'terminal' }))
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:new-claude-chat', () => handleNewClaudeTab())
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
    handleNewClaudeTab,
    navigateToPreviousTab,
    navigateToNextTab,
  ])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!getModifierKey(e)) return

      // Cmd/Ctrl+T - New terminal tab
      if (e.key === 't' && !e.shiftKey) {
        e.preventDefault()
        createTab()
      }

      // Cmd/Ctrl+Shift+T - New Claude chat tab
      if (e.key === 'T' && e.shiftKey) {
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
  ])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1e1e1e',
      }}
    >
      {/* Tab bar */}
      <TabBar onNewTab={handleNewTab} onCloseTab={handleCloseTab} />

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {/* Terminal views */}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
        {tabs.map((tab) => (
            <div
              key={tab.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: tab.isActive ? 'block' : 'none',
              }}
            >
              {tab.type === 'claude-chat' && tab.agentId && tab.workingDir ? (
                <ClaudeChat agentId={tab.agentId} workingDir={tab.workingDir} />
              ) : (
                <TerminalView terminalId={tab.id} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Preferences modal */}
      <PreferencesModal isOpen={isPreferencesOpen} onClose={() => setIsPreferencesOpen(false)} />
    </div>
  )
}

export default App
