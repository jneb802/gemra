import React from 'react'
import { Plus, Terminal, MessageSquare } from 'lucide-react'
import { useTabStore } from '../../stores/tabStore'

interface SessionTabsProps {
  tabId: string
  onCreateSubTerminal: () => void
}

export const SessionTabs: React.FC<SessionTabsProps> = ({
  tabId,
  onCreateSubTerminal,
}) => {
  const tab = useTabStore((state) => state.tabs.find((t) => t.id === tabId))
  const setActiveSubTerminal = useTabStore((state) => state.setActiveSubTerminal)
  const closeSubTerminal = useTabStore((state) => state.closeSubTerminal)

  if (!tab || tab.type !== 'agent-chat') return null

  const subTerminals = tab.subTerminals || []
  const activeSubTerminalId = tab.activeSubTerminalId

  const handleCloseSubTerminal = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    const session = subTerminals.find((s) => s.id === sessionId)
    if (session) {
      window.electron.pty.kill(session.terminalId)
    }
    closeSubTerminal(tabId, sessionId)
  }

  return (
    <div className="session-tabs">
      <div className="session-tabs-list">
        {/* "Chat" permanent tab */}
        <button
          className={`session-tab ${activeSubTerminalId === null ? 'active' : ''}`}
          onClick={() => setActiveSubTerminal(tabId, null)}
          title="Chat"
        >
          <MessageSquare size={12} className="session-tab-icon" />
          <span className="session-tab-title">Chat</span>
        </button>

        {/* Sub-terminal tabs */}
        {subTerminals.map((session) => (
          <button
            key={session.id}
            className={`session-tab ${session.id === activeSubTerminalId ? 'active' : ''}`}
            onClick={() => setActiveSubTerminal(tabId, session.id)}
            title={session.title}
          >
            <Terminal size={12} className="session-tab-icon" />
            <span className="session-tab-title">{session.title}</span>
            <span
              className="session-tab-close"
              onClick={(e) => handleCloseSubTerminal(e, session.id)}
            >
              ×
            </span>
          </button>
        ))}

        {/* New sub-terminal button */}
        <div className="session-tabs-new-buttons">
          <button
            className="session-tab-new"
            onClick={onCreateSubTerminal}
            title="New terminal"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
