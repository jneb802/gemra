import React, { useCallback, useState } from 'react'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'
import { WelcomeScreen } from '../Welcome/WelcomeScreen'
import { SessionTabs } from './SessionTabs'
import { BlockTerminal } from '../Terminal/BlockTerminal'
import { useTabStore, type ChatSession } from '../../stores/tabStore'
import { useBlockStore } from '../../stores/blockStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useClaudeChatStore } from '../../stores/claudeChatStore'
import { useClaudeAgent } from './hooks/useClaudeAgent'
import { useGitOperations } from './hooks/useGitOperations'
import { useWorktreeOperations } from './hooks/useWorktreeOperations'
import { useContainerManagement } from './hooks/useContainerManagement'
import { useCommandSystem } from './hooks/useCommandSystem'
import { useMessageMetadata } from './hooks/useMessageMetadata'
import { generateId } from '../../../shared/utils/id'
import type { ContainerStatus } from '../../../shared/types'

interface ClaudeChatProps {
  agentId?: string
  workingDir: string
  onUserMessage?: () => void
  onCreateProject: () => void
  onOpenRepository: () => void
  onCloneRepository: () => void
  onOpenRecent: (path: string) => void
}

type ClaudeMode = 'default' | 'acceptEdits' | 'plan'

export const ClaudeChat: React.FC<ClaudeChatProps> = ({
  agentId: propAgentId,
  workingDir,
  onUserMessage,
  onCreateProject,
  onOpenRepository,
  onCloneRepository,
  onOpenRecent
}) => {
  // Store selectors
  const updateTabAgent = useTabStore((state) => state.updateTabAgent)
  const updateChatSessionAgent = useTabStore((state) => state.updateChatSessionAgent)
  const activeTabId = useTabStore((state) => state.activeTabId)
  const useDocker = useSettingsStore((state) => state.useDocker)
  const updateSettings = useSettingsStore((state) => state.updateSettings)

  // Get active session (generic - can be chat or terminal)
  const activeSession = useTabStore((state) => {
    if (!activeTabId) return undefined
    return state.getActiveSession(activeTabId)
  })

  const isChatSession = activeSession?.type === 'chat'
  const isTerminalSession = activeSession?.type === 'terminal'

  // Use active chat session's agentId, fallback to prop agentId for backwards compatibility
  const agentId = isChatSession ? activeSession?.agentId || propAgentId : propAgentId

  // Get messages from store (use agentId if available, otherwise empty array)
  const messages = useClaudeChatStore((state) =>
    agentId ? state.getMessages(agentId) : []
  )

  // Get agent config from store
  const agentConfig = useClaudeChatStore((state) =>
    agentId ? state.getAgentConfig(agentId) : { mode: 'default' as ClaudeMode, model: 'sonnet' }
  )
  const setAgentConfig = useClaudeChatStore((state) => state.setAgentConfig)

  // Get token usage from store
  const tokenUsage = useClaudeChatStore((state) =>
    agentId ? state.getTokenUsage(agentId) : { inputTokens: 0, outputTokens: 0 }
  )

  // Local container state (to break circular dependency between agent and container hooks)
  const [containerStatus, setContainerStatus] = useState<ContainerStatus>('disabled')
  const [containerError, setContainerError] = useState<string | undefined>()

  // Container status update handler
  const handleContainerStatusUpdate = useCallback((status: string, error?: string) => {
    setContainerStatus(status as ContainerStatus)
    if (error !== undefined) {
      setContainerError(error)
    }
  }, [])

  // Initialize agent hook
  const agent = useClaudeAgent({
    agentId,
    workingDir,
    useDocker,
    onUserMessage,
    onUpdateTabAgent: updateTabAgent,
    onUpdateSessionAgent: (newAgentId: string) => {
      if (activeTabId && activeSession?.id) {
        updateChatSessionAgent(activeTabId, activeSession.id, newAgentId)
      }
    },
    activeTabId,
    activeChatSessionId: activeSession?.id,
    onContainerStatusUpdate: handleContainerStatusUpdate
  })

  // Initialize git operations hook
  const git = useGitOperations({
    workingDir,
    onAddSystemMessage: agent.addSystemMessage
  })

  // Initialize worktree operations hook
  const worktree = useWorktreeOperations({
    workingDir,
    onAddSystemMessage: agent.addSystemMessage
  })

  // Initialize container management hook
  const containerManagement = useContainerManagement({
    workingDir,
    currentAgentId: agent.currentAgentId,
    useDocker,
    onRestartAgent: agent.restartAgent,
    onAddSystemMessage: agent.addSystemMessage,
    onUpdateSettings: updateSettings,
    onUpdateTabAgent: updateTabAgent,
    activeTabId
  })

  // Sync local container state with container management hook
  React.useEffect(() => {
    setContainerStatus(containerManagement.containerStatus)
    setContainerError(containerManagement.containerError)
  }, [containerManagement.containerStatus, containerManagement.containerError])

  // Initialize command system hook
  const commands = useCommandSystem({
    agentId: agent.currentAgentId,
    workingDir,
    onSendMessage: agent.sendMessage,
    onAddSystemMessage: agent.addSystemMessage,
    onClearMessages: () => {
      if (agent.currentAgentId) {
        agent.clearMessages(agent.currentAgentId)
      }
    },
    onModeChange: (mode: ClaudeMode) => {
      if (agent.currentAgentId) {
        setAgentConfig(agent.currentAgentId, { mode })
      }
    },
    onModelChange: (model: string) => {
      if (agent.currentAgentId) {
        setAgentConfig(agent.currentAgentId, { model })
      }
    },
    gitOperations: {
      checkoutBranch: git.checkoutBranch,
      createBranch: git.createBranch,
      fetchBranches: git.fetchBranches,
      getGitStatus: git.getGitStatus
    },
    worktreeOperations: {
      listWorktrees: worktree.listWorktrees
    }
  })

  // Initialize metadata hook
  const metadata = useMessageMetadata({
    isWorking: agent.isWorking,
    currentTurnMetadata: agent.currentTurnMetadata,
    onMetadataUpdate: (meta) => {
      // Trigger re-render for timer updates
      // This is intentionally a no-op - the hook handles timer internally
    }
  })

  // Helper to get tool display name
  const getToolDisplayName = (toolName: string): string => {
    const toolMap: Record<string, string> = {
      Read: 'Reading file',
      Write: 'Writing file',
      Edit: 'Editing file',
      Bash: 'Running command',
      Grep: 'Searching code',
      Glob: 'Finding files',
      Task: 'Spawning agent',
      WebSearch: 'Searching web',
      WebFetch: 'Fetching URL'
    }
    return toolMap[toolName] || `Running ${toolName}`
  }

  // State for new session creation
  const [isCreatingSession, setIsCreatingSession] = useState(false)

  // Handle chat session change
  const handleSessionChange = useCallback((sessionId: string) => {
    // Session change will trigger re-render with new agentId
    // The chat messages and state will automatically update
  }, [])

  // Handle creating a new chat session with agent initialization
  const handleCreateNewSession = useCallback(async () => {
    if (!activeTabId || isCreatingSession) return

    setIsCreatingSession(true)

    try {
      // Start a new agent first
      const result = await window.electron.claude.start(workingDir, undefined, useDocker)

      if (result.success && result.agentId) {
        // Create the session with the initialized agent ID
        const sessionId = generateId.tab()
        const tab = useTabStore.getState().tabs.find((t) => t.id === activeTabId)
        const chatSessions = tab?.chatSessions || []
        const sessionNumber = chatSessions.filter(s => s.type === 'chat').length + 1

        const newSession: ChatSession = {
          id: sessionId,
          title: `Chat ${sessionNumber}`,
          type: 'chat',
          agentId: result.agentId,
          createdAt: Date.now(),
          lastActive: Date.now()
        }

        // Add session to store
        useTabStore.setState((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== activeTabId) return t
            return {
              ...t,
              chatSessions: [...(t.chatSessions || []), newSession],
              activeChatSessionId: sessionId
            }
          })
        }))

        handleSessionChange(sessionId)
      } else {
        console.error('Failed to start Claude agent:', result.error)
        agent.addSystemMessage(`Failed to create new chat session: ${result.error}`)
      }
    } catch (error) {
      console.error('Exception creating new session:', error)
      agent.addSystemMessage('Failed to create new chat session')
    } finally {
      setIsCreatingSession(false)
    }
  }, [activeTabId, workingDir, useDocker, isCreatingSession, handleSessionChange, agent])

  // Handle creating a new terminal session
  const handleCreateTerminalSession = useCallback(async () => {
    if (!activeTabId || isCreatingSession) return

    setIsCreatingSession(true)
    try {
      const sessionId = useTabStore.getState().createTerminalSession(
        activeTabId,
        workingDir
      )
      handleSessionChange(sessionId)
    } finally {
      setIsCreatingSession(false)
    }
  }, [activeTabId, workingDir, isCreatingSession, handleSessionChange])

  // Handle mode cycling (Shift+Tab) and chat session switching (Cmd+[ / Cmd+])
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Mode cycling with Shift+Tab
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()

        const modes: ClaudeMode[] = ['default', 'acceptEdits', 'plan']
        const currentIndex = modes.indexOf(agentConfig.mode)
        const nextIndex = (currentIndex + 1) % modes.length
        const nextMode = modes[nextIndex]

        if (agent.currentAgentId) {
          setAgentConfig(agent.currentAgentId, { mode: nextMode })
        }
      }

      // Cmd+1-9: Switch to specific chat session
      if (activeTabId && (e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        const tab = useTabStore.getState().tabs.find((t) => t.id === activeTabId)
        const chatSessions = tab?.chatSessions || []
        const index = parseInt(e.key) - 1

        if (chatSessions[index]) {
          e.preventDefault()
          useTabStore.getState().setActiveChatSession(activeTabId, chatSessions[index].id)
        }
      }

      // Chat session navigation with Cmd+[ / Cmd+]
      if (activeTabId && (e.metaKey || e.ctrlKey)) {
        const tab = useTabStore.getState().tabs.find((t) => t.id === activeTabId)
        const chatSessions = tab?.chatSessions || []

        if (chatSessions.length > 1) {
          const currentIndex = chatSessions.findIndex((s) => s.id === tab?.activeChatSessionId)

          if (e.key === '[') {
            // Previous session
            e.preventDefault()
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : chatSessions.length - 1
            const prevSession = chatSessions[prevIndex]
            if (prevSession) {
              useTabStore.getState().setActiveChatSession(activeTabId, prevSession.id)
            }
          } else if (e.key === ']') {
            // Next session
            e.preventDefault()
            const nextIndex = (currentIndex + 1) % chatSessions.length
            const nextSession = chatSessions[nextIndex]
            if (nextSession) {
              useTabStore.getState().setActiveChatSession(activeTabId, nextSession.id)
            }
          }
        }
      }

      // New terminal session with Cmd+T
      if (activeTabId && (e.metaKey || e.ctrlKey) && e.key === 't' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        handleCreateTerminalSession()
      }

      // New chat session with Cmd+Shift+T
      if (activeTabId && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        e.stopPropagation()
        handleCreateNewSession()
      }

      // Close current session with Cmd+W
      if (activeTabId && (e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault()
        e.stopPropagation()
        const tab = useTabStore.getState().tabs.find((t) => t.id === activeTabId)
        const chatSessions = tab?.chatSessions || []

        if (chatSessions.length > 1 && tab?.activeChatSessionId) {
          // Multiple sessions: close the current one
          const session = chatSessions.find(s => s.id === tab.activeChatSessionId)

          // Cleanup terminal PTY if needed
          if (session?.type === 'terminal' && session.terminalId) {
            window.electron.pty.kill(session.terminalId)
            useBlockStore.getState().clearBlocks(session.terminalId)
          }

          useTabStore.getState().closeChatSession(activeTabId, tab.activeChatSessionId)
        } else if (chatSessions.length === 1 && tab?.activeChatSessionId) {
          // Last session: clear messages/blocks and reset
          const currentSession = chatSessions[0]
          if (currentSession?.type === 'chat' && currentSession.agentId) {
            agent.clearMessages(currentSession.agentId)
          } else if (currentSession?.type === 'terminal' && currentSession.terminalId) {
            useBlockStore.getState().clearBlocks(currentSession.terminalId)
          }
        }
      }
    }

    // Use capture phase to intercept before other handlers
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [agentConfig.mode, agent.currentAgentId, setAgentConfig, activeTabId, handleSessionChange, handleCreateNewSession, handleCreateTerminalSession, agent])

  return (
    <div className="claude-chat">
      {/* Conditional content based on session type */}
      {isChatSession ? (
        <>
          {/* Show welcome screen when there are no messages */}
          {messages.length === 0 ? (
            <WelcomeScreen
              onCreateProject={onCreateProject}
              onOpenRepository={onOpenRepository}
              onCloneRepository={onCloneRepository}
              onOpenRecent={onOpenRecent}
            />
          ) : (
            <MessageList
              messages={messages}
              isStreaming={agent.agentStatus.type === 'streaming'}
              currentTurnMetadata={agent.currentTurnMetadata}
              onRespondToQuest={agent.respondToQuest}
            />
          )}

          {/* Status indicators */}
          {agent.agentStatus.type === 'thinking' && (
            <div className="status-indicator thinking">
              <span className="status-icon">🤔</span>
              <span className="status-text">Thinking...</span>
            </div>
          )}

          {agent.agentStatus.type === 'streaming' && agent.isWorking && (
            <div className="status-indicator streaming">
              <span className="status-icon">✍️</span>
              <span className="status-text">Writing response...</span>
            </div>
          )}

          {agent.agentStatus.type === 'tool_execution' && agent.agentStatus.tool && (
            <div className="status-indicator tool-execution">
              <span className="status-icon">🔧</span>
              <span className="status-text">{getToolDisplayName(agent.agentStatus.tool.name)}</span>
              {agent.agentStatus.tool.name === 'Read' && agent.agentStatus.tool.input?.file_path && (
                <span className="status-detail">{agent.agentStatus.tool.input.file_path}</span>
              )}
              {agent.agentStatus.tool.name === 'Bash' && agent.agentStatus.tool.input?.command && (
                <span className="status-detail">{agent.agentStatus.tool.input.command}</span>
              )}
              {agent.agentStatus.tool.name === 'Grep' && agent.agentStatus.tool.input?.pattern && (
                <span className="status-detail">"{agent.agentStatus.tool.input.pattern}"</span>
              )}
            </div>
          )}

          {agent.isInitializingAgent && (
            <div className="status-indicator thinking">
              <span className="status-icon">🚀</span>
              <span className="status-text">Starting Claude Code agent...</span>
            </div>
          )}

          {agent.error && <div className="error-message">Error: {agent.error}</div>}

          {/* Session tabs - always visible */}
          {activeTabId && (
            <SessionTabs
              tabId={activeTabId}
              onSessionChange={handleSessionChange}
              onCreateChatSession={handleCreateNewSession}
              onCreateTerminalSession={handleCreateTerminalSession}
              isCreatingSession={isCreatingSession}
            />
          )}

          {/* Input box - only for chat sessions */}
          <InputBox
            onSend={agent.sendMessage}
            disabled={agent.isWorking || agent.isInitializingAgent}
            customCommands={commands.customCommands}
            claudeCommands={commands.claudeCommands}
            onExecuteCommand={commands.handleExecuteCommand}
            onExecuteCommandFromInput={commands.handleExecuteCommandFromInput}
            tabId={agent.currentAgentId}
            showBranchMenu={git.showBranchMenu}
            branchList={git.branchList}
            currentBranch={git.gitBranch}
            onBranchSelect={git.handleBranchSelect}
            onCloseBranchMenu={git.closeBranchMenu}
            showWorktreeMenu={worktree.showWorktreeMenu}
            worktreeList={worktree.worktreeList}
            worktreeMenuMode={worktree.worktreeMenuMode}
            onWorktreeSelect={worktree.handleWorktreeSelect}
            onCloseWorktreeMenu={worktree.closeWorktreeMenu}
            onWorktreeSubcommand={(subcommand: string, args?: string) => {
              switch (subcommand) {
                case 'create':
                  if (args) {
                    const [path, branch] = args.split(/\s+/)
                    if (path && branch) {
                      worktree.addWorktree(path, branch)
                    } else {
                      agent.addSystemMessage('Usage: /worktree create <path> <branch>')
                    }
                  } else {
                    agent.addSystemMessage('Usage: /worktree create <path> <branch>')
                  }
                  break
                case 'remove':
                  if (args) {
                    worktree.removeWorktree(args)
                  } else {
                    agent.addSystemMessage('Usage: /worktree remove <path>')
                  }
                  break
                case 'prune':
                  worktree.pruneWorktrees()
                  break
                case 'list':
                  worktree.listWorktrees()
                  break
                default:
                  agent.addSystemMessage(`Unknown worktree subcommand: ${subcommand}`)
              }
            }}
            onShowWorktreeSubcommands={worktree.showSubcommands}
            onShowWorktreeList={worktree.showList}
            workingDir={workingDir}
            gitBranch={git.gitBranch}
            gitStats={git.gitStats}
            model={agentConfig.model}
            onModelChange={(model: string) => {
              if (agent.currentAgentId) {
                setAgentConfig(agent.currentAgentId, { model })
              }
            }}
            onBranchClick={git.handleBranchClick}
            agentMode={agentConfig.mode}
            onAgentModeChange={(mode: ClaudeMode) => {
              if (agent.currentAgentId) {
                setAgentConfig(agent.currentAgentId, { mode })
              }
            }}
            containerStatus={containerStatus}
            containerError={containerError}
            onContainerToggle={containerManagement.handleContainerToggle}
            tokenUsage={tokenUsage}
            dangerouslySkipPermissions={containerManagement.dangerouslySkipPermissions}
          />
        </>
      ) : isTerminalSession && activeSession?.terminalId ? (
        <>
          <BlockTerminal
            terminalId={activeSession.terminalId}
            workingDir={activeSession.workingDir || workingDir}
          />

          {/* Session tabs - always visible */}
          {activeTabId && (
            <SessionTabs
              tabId={activeTabId}
              onSessionChange={handleSessionChange}
              onCreateChatSession={handleCreateNewSession}
              onCreateTerminalSession={handleCreateTerminalSession}
              isCreatingSession={isCreatingSession}
            />
          )}
        </>
      ) : null}

      {isCreatingSession && (
        <div className="status-indicator thinking">
          <span className="status-icon">✨</span>
          <span className="status-text">Creating new session...</span>
        </div>
      )}
    </div>
  )
}
