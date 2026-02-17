import React, { useCallback, useState } from 'react'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'
import { WelcomeScreen } from '../Welcome/WelcomeScreen'
import { StatusIndicators } from './StatusIndicators'
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
  agentId,
  workingDir,
  onUserMessage,
  onCreateProject,
  onOpenRepository,
  onCloneRepository,
  onOpenRecent
}) => {
  // Store selectors
  const updateTabAgent = useTabStore((state) => state.updateTabAgent)
  const activeTabId = useTabStore((state) => state.activeTabId)
  const useDocker = useSettingsStore((state) => state.useDocker)
  const updateSettings = useSettingsStore((state) => state.updateSettings)

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
    activeTabId,
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

  // Handle mode cycling (Shift+Tab)
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

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [agentConfig.mode, agent.currentAgentId, setAgentConfig])

  return (
    <div className="claude-chat">
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
        />
      )}

      {/* Status indicators */}
      <StatusIndicators
        agentStatus={agent.agentStatus}
        isWorking={agent.isWorking}
        isInitializingAgent={agent.isInitializingAgent}
        error={agent.error}
      />

      {/* Input box */}
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
    </div>
  )
}
