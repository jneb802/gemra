import React from 'react'
import { Terminal, MessageSquare } from 'lucide-react'
import { useTabStore, type ChatSession } from '../../stores/tabStore'

interface SessionTabsProps {
  tabId: string
  onSessionChange: (sessionId: string) => void
  onCreateChatSession: () => void
  onCreateTerminalSession: () => void
  isCreatingSession?: boolean
}

export const SessionTabs: React.FC<SessionTabsProps> = ({
  tabId,
  onSessionChange,
  onCreateChatSession,
  onCreateTerminalSession,
  isCreatingSession = false
}) => {
  const chatSessions = useTabStore((state) => {
    const tab = state.tabs.find((t) => t.id === tabId)
    return tab?.chatSessions || []
  })

  const activeChatSessionId = useTabStore((state) => {
    const tab = state.tabs.find((t) => t.id === tabId)
    return tab?.activeChatSessionId
  })

  const closeChatSession = useTabStore((state) => state.closeChatSession)
  const setActiveChatSession = useTabStore((state) => state.setActiveChatSession)

  const handleCloseSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    closeChatSession(tabId, sessionId)

    // Find the new active session after closing
    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId)
    if (tab?.activeChatSessionId) {
      onSessionChange(tab.activeChatSessionId)
    }
  }

  const handleSelectSession = (sessionId: string) => {
    setActiveChatSession(tabId, sessionId)
    onSessionChange(sessionId)
  }

  if (chatSessions.length === 0) {
    return null
  }

  return (
    <div className="session-tabs">
      <div className="session-tabs-list">
        {chatSessions.map((session) => {
          const Icon = session.type === 'terminal' ? Terminal : MessageSquare
          return (
            <button
              key={session.id}
              className={`session-tab ${session.id === activeChatSessionId ? 'active' : ''}`}
              onClick={() => handleSelectSession(session.id)}
              title={session.title}
            >
              <Icon size={12} className="session-tab-icon" />
              <span className="session-tab-title">{session.title}</span>
              {chatSessions.length > 1 && (
                <span
                  className="session-tab-close"
                  onClick={(e) => handleCloseSession(e, session.id)}
                >
                  ×
                </span>
              )}
            </button>
          )
        })}
        <div className="session-tabs-new-buttons">
          <button
            className="session-tab-new"
            onClick={onCreateChatSession}
            title="New chat session (Cmd+Shift+T)"
            disabled={isCreatingSession}
          >
            {isCreatingSession ? '...' : <MessageSquare size={12} />}
          </button>
          <button
            className="session-tab-new"
            onClick={onCreateTerminalSession}
            title="New terminal session (Cmd+T)"
            disabled={isCreatingSession}
          >
            {isCreatingSession ? '...' : <Terminal size={12} />}
          </button>
        </div>
      </div>
    </div>
  )
}
