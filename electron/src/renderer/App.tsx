import { useEffect, useCallback, useState } from 'react'
import { TabBar } from './components/Tabs/TabBar'
import { TerminalView } from './components/Terminal/TerminalView'
import { SplitLayout } from './components/SplitPane/SplitLayout'
import { FileBrowserPanel } from './components/FileBrowser/FileBrowserPanel'
import { PreferencesModal } from './components/Preferences/PreferencesModal'
import { useTabStore } from './stores/tabStore'
import { useLayoutStore } from './stores/layoutStore'
import { useFileBrowserStore } from './stores/fileBrowserStore'

function App() {
  const tabs = useTabStore((state) => state.tabs)
  const activeTabId = useTabStore((state) => state.activeTabId)
  const createTab = useTabStore((state) => state.createTab)
  const closeTab = useTabStore((state) => state.closeTab)
  const setActiveTab = useTabStore((state) => state.setActiveTab)
  const getTabByIndex = useTabStore((state) => state.getTabByIndex)

  const getLayout = useLayoutStore((state) => state.getLayout)
  const getActivePaneId = useLayoutStore((state) => state.getActivePaneId)
  const setActivePaneId = useLayoutStore((state) => state.setActivePaneId)
  const splitPane = useLayoutStore((state) => state.splitPane)
  const closePane = useLayoutStore((state) => state.closePane)
  const focusNextPane = useLayoutStore((state) => state.focusNextPane)
  const focusPreviousPane = useLayoutStore((state) => state.focusPreviousPane)

  const toggleFileBrowser = useFileBrowserStore((state) => state.toggleVisibility)

  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false)

  // Create initial tab on mount
  useEffect(() => {
    if (tabs.length === 0) {
      createTab()
    }
  }, [])

  // Handle menu events
  useEffect(() => {
    const unsubscribers: (() => void)[] = []

    unsubscribers.push(
      window.electron.onMenuEvent('menu:new-tab', () => createTab())
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:close-tab', () => {
        if (activeTabId) {
          const layout = getLayout(activeTabId)
          const activePaneId = getActivePaneId(activeTabId)
          if (layout && activePaneId) {
            closePane(activeTabId, activePaneId)
            const updatedLayout = getLayout(activeTabId)
            if (!updatedLayout) closeTab(activeTabId)
          } else {
            closeTab(activeTabId)
          }
        }
      })
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:split-horizontal', () => {
        if (activeTabId) {
          const layout = getLayout(activeTabId)
          const activePaneId = getActivePaneId(activeTabId)
          if (!layout || !activePaneId) {
            const newTabId = createTab()
            splitPane(activeTabId, activeTabId, 'horizontal', newTabId)
            closeTab(newTabId)
          } else {
            const newTabId = createTab()
            splitPane(activeTabId, activePaneId, 'horizontal', newTabId)
            closeTab(newTabId)
          }
        }
      })
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:split-vertical', () => {
        if (activeTabId) {
          const layout = getLayout(activeTabId)
          const activePaneId = getActivePaneId(activeTabId)
          if (!layout || !activePaneId) {
            const newTabId = createTab()
            splitPane(activeTabId, activeTabId, 'vertical', newTabId)
            closeTab(newTabId)
          } else {
            const newTabId = createTab()
            splitPane(activeTabId, activePaneId, 'vertical', newTabId)
            closeTab(newTabId)
          }
        }
      })
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:previous-tab', () => {
        const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
        if (currentIndex > 0) setActiveTab(tabs[currentIndex - 1].id)
      })
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:next-tab', () => {
        const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
        if (currentIndex < tabs.length - 1) setActiveTab(tabs[currentIndex + 1].id)
      })
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:toggle-file-browser', () => toggleFileBrowser())
    )

    unsubscribers.push(
      window.electron.onMenuEvent('menu:preferences', () => setIsPreferencesOpen(true))
    )

    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [
    tabs,
    activeTabId,
    createTab,
    closeTab,
    setActiveTab,
    getLayout,
    getActivePaneId,
    splitPane,
    closePane,
    toggleFileBrowser,
  ])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = window.electron.platform === 'darwin'
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey

      if (!cmdOrCtrl) return

      // Cmd/Ctrl+T - New tab
      if (e.key === 't') {
        e.preventDefault()
        createTab()
      }

      // Cmd/Ctrl+W - Close tab or pane
      if (e.key === 'w') {
        e.preventDefault()
        if (activeTabId) {
          const layout = getLayout(activeTabId)
          const activePaneId = getActivePaneId(activeTabId)

          if (layout && activePaneId) {
            // Close active pane
            closePane(activeTabId, activePaneId)

            // If no panes left in tab, close the tab
            const updatedLayout = getLayout(activeTabId)
            if (!updatedLayout) {
              closeTab(activeTabId)
            }
          } else {
            // No panes, just close the tab
            closeTab(activeTabId)
          }
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
        const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
        if (currentIndex > 0) {
          setActiveTab(tabs[currentIndex - 1].id)
        }
      }

      // Cmd/Ctrl+Shift+] - Next tab
      if (e.shiftKey && e.key === ']') {
        e.preventDefault()
        const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
        if (currentIndex < tabs.length - 1) {
          setActiveTab(tabs[currentIndex + 1].id)
        }
      }

      // Cmd/Ctrl+D - Split horizontally
      if (e.key === 'd' && !e.shiftKey) {
        e.preventDefault()
        if (activeTabId) {
          const layout = getLayout(activeTabId)
          const activePaneId = getActivePaneId(activeTabId)

          if (!layout || !activePaneId) {
            // No layout yet, create initial split with current tab
            const newTabId = createTab()
            splitPane(activeTabId, activeTabId, 'horizontal', newTabId)
            // Remove the newly created tab from tab bar (we only want it in the pane)
            closeTab(newTabId)
          } else {
            // Split the active pane
            const newTabId = createTab()
            splitPane(activeTabId, activePaneId, 'horizontal', newTabId)
            // Remove the newly created tab from tab bar
            closeTab(newTabId)
          }
        }
      }

      // Cmd/Ctrl+Shift+D - Split vertically
      if (e.key === 'd' && e.shiftKey) {
        e.preventDefault()
        if (activeTabId) {
          const layout = getLayout(activeTabId)
          const activePaneId = getActivePaneId(activeTabId)

          if (!layout || !activePaneId) {
            // No layout yet, create initial split with current tab
            const newTabId = createTab()
            splitPane(activeTabId, activeTabId, 'vertical', newTabId)
            // Remove the newly created tab from tab bar
            closeTab(newTabId)
          } else {
            // Split the active pane
            const newTabId = createTab()
            splitPane(activeTabId, activePaneId, 'vertical', newTabId)
            // Remove the newly created tab from tab bar
            closeTab(newTabId)
          }
        }
      }

      // Cmd/Ctrl+[ - Previous pane
      if (e.key === '[' && !e.shiftKey) {
        e.preventDefault()
        if (activeTabId) {
          focusPreviousPane(activeTabId)
        }
      }

      // Cmd/Ctrl+] - Next pane
      if (e.key === ']' && !e.shiftKey) {
        e.preventDefault()
        if (activeTabId) {
          focusNextPane(activeTabId)
        }
      }

      // Cmd/Ctrl+B - Toggle file browser
      if (e.key === 'b') {
        e.preventDefault()
        toggleFileBrowser()
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
    tabs,
    activeTabId,
    createTab,
    closeTab,
    setActiveTab,
    getTabByIndex,
    getLayout,
    getActivePaneId,
    setActivePaneId,
    splitPane,
    closePane,
    focusNextPane,
    focusPreviousPane,
    toggleFileBrowser,
  ])

  const handleNewTab = useCallback(() => {
    createTab()
  }, [createTab])

  const handlePaneClick = useCallback(
    (tabId: string, paneId: string) => {
      setActivePaneId(tabId, paneId)
    },
    [setActivePaneId]
  )

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
      <TabBar onNewTab={handleNewTab} />

      {/* Main content area with file browser and terminal */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {/* File browser sidebar */}
        <FileBrowserPanel />

        {/* Terminal views */}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
        {tabs.map((tab) => {
          const layout = getLayout(tab.id)

          return (
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
              {layout ? (
                <SplitLayout layout={layout} onPaneClick={(paneId) => handlePaneClick(tab.id, paneId)} />
              ) : (
                <TerminalView terminalId={tab.id} />
              )}
            </div>
          )
        })}
        </div>
      </div>

      {/* Preferences modal */}
      <PreferencesModal isOpen={isPreferencesOpen} onClose={() => setIsPreferencesOpen(false)} />
    </div>
  )
}

export default App
