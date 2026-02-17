import React from 'react'
import { useTabStore, type ChatSession } from '../../stores/tabStore'

interface ChatSessionTabsProps {
  tabId: string
  onSessionChange: (sessionId: string) => void
}

export const ChatSessionTabs: React.FC<ChatSessionTabsProps> = ({ tabId, onSessionChange }) => {
  const chatSessions = useTabStore((state) => {
    const tab = state.tabs.find((t) => t.id === tabId)
    return tab?.chatSessions || []
  })

  const activeChatSessionId = useTabStore((state) => {
    const tab = state.tabs.find((t) => t.id === tabId)
    return tab?.activeChatSessionId
  })

  const createChatSession = useTabStore((state) => state.createChatSession)
  const closeChatSession = useTabStore((state) => state.closeChatSession)
  const setActiveChatSession = useTabStore((state) => state.setActiveChatSession)

  const handleNewChat = () => {
    const sessionId = createChatSession(tabId)
    onSessionChange(sessionId)
  }

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
    <div className="chat-session-tabs">
      <div className="chat-session-tabs-list">
        {chatSessions.map((session) => (
          <button
            key={session.id}
            className={`chat-session-tab ${session.id === activeChatSessionId ? 'active' : ''}`}
            onClick={() => handleSelectSession(session.id)}
            title={session.title}
          >
            <span className="chat-session-tab-title">{session.title}</span>
            {chatSessions.length > 1 && (
              <span
                className="chat-session-tab-close"
                onClick={(e) => handleCloseSession(e, session.id)}
              >
                ×
              </span>
            )}
          </button>
        ))}
        <button
          className="chat-session-tab-new"
          onClick={handleNewChat}
          title="New chat session"
        >
          +
        </button>
      </div>
    </div>
  )
}
