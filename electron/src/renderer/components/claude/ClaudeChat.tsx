import React, { useCallback, useState } from 'react'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'
import { WelcomeScreen } from '../Welcome/WelcomeScreen'
import { SessionTabs } from './SessionTabs'
import { BlockTerminal } from '../Terminal/BlockTerminal'
import { useTabStore } from '../../stores/tabStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useClaudeChatStore } from '../../stores/claudeChatStore'
import { useClaudeAgent } from './hooks/useClaudeAgent'
import { useGitOperations } from './hooks/useGitOperations'
import { useWorktreeOperations } from './hooks/useWorktreeOperations'
import { useContainerManagement } from './hooks/useContainerManagement'
import { useCommandSystem } from './hooks/useCommandSystem'
import { useMessageMetadata } from './hooks/useMessageMetadata'
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
  const updateTabAgent = useTabStore((state) => state.updateTabAgent)
  const activeTabId = useTabStore((state) => state.activeTabId)
  const useDocker = useSettingsStore((state) => state.useDocker)
  const updateSettings = useSettingsStore((state) => state.updateSettings)

  const agentId = propAgentId

  // Get active sub-terminal from store
  const activeSubTerminal = useTabStore((state) => {
    if (!activeTabId) return undefined
    return state.getActiveSubTerminal(activeTabId)
  })

  const messages = useClaudeChatStore((state) =>
    agentId ? state.getMessages(agentId) : []
  )

  const agentConfig = useClaudeChatStore((state) =>
    agentId ? state.getAgentConfig(agentId) : { mode: 'default' as ClaudeMode, model: 'sonnet' }
  )
  const setAgentConfig = useClaudeChatStore((state) => state.setAgentConfig)

  const tokenUsage = useClaudeChatStore((state) =>
    agentId ? state.getTokenUsage(agentId) : { inputTokens: 0, outputTokens: 0 }
  )

  const [containerStatus, setContainerStatus] = useState<ContainerStatus>('disabled')
  const [containerError, setContainerError] = useState<string | undefined>()

  const handleContainerStatusUpdate = useCallback((status: string, error?: string) => {
    setContainerStatus(status as ContainerStatus)
    if (error !== undefined) {
      setContainerError(error)
    }
  }, [])

  const agent = useClaudeAgent({
    agentId,
    workingDir,
    useDocker,
    onUserMessage,
    onUpdateTabAgent: updateTabAgent,
    onUpdateSessionAgent: (newAgentId: string) => {
      if (activeTabId) {
        updateTabAgent(activeTabId, newAgentId)
      }
    },
    activeTabId,
    activeChatSessionId: undefined,
    onContainerStatusUpdate: handleContainerStatusUpdate
  })

  const git = useGitOperations({
    workingDir,
    onAddSystemMessage: agent.addSystemMessage
  })

  const worktree = useWorktreeOperations({
    workingDir,
    onAddSystemMessage: agent.addSystemMessage
  })

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

  React.useEffect(() => {
    setContainerStatus(containerManagement.containerStatus)
    setContainerError(containerManagement.containerError)
  }, [containerManagement.containerStatus, containerManagement.containerError])

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

  useMessageMetadata({
    isWorking: agent.isWorking,
    currentTurnMetadata: agent.currentTurnMetadata,
    onMetadataUpdate: (_meta) => {}
  })

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

  const handleCreateSubTerminal = useCallback(() => {
    if (!activeTabId) return
    useTabStore.getState().addSubTerminal(activeTabId, workingDir)
  }, [activeTabId, workingDir])

  // Mode cycling with Shift+Tab
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [agentConfig.mode, agent.currentAgentId, setAgentConfig])

  return (
    <div className="claude-chat">
      {activeSubTerminal ? (
        <BlockTerminal
          terminalId={activeSubTerminal.terminalId}
          workingDir={activeSubTerminal.workingDir}
          sessionTabs={
            activeTabId && (
              <SessionTabs
                tabId={activeTabId}
                onCreateSubTerminal={handleCreateSubTerminal}
              />
            )
          }
        />
      ) : (
        <>
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

          {activeTabId && (
            <SessionTabs
              tabId={activeTabId}
              onCreateSubTerminal={handleCreateSubTerminal}
            />
          )}

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
      )}
    </div>
  )
}
