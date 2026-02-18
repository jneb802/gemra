import { useState, useEffect, useCallback } from 'react'
import type { SlashCommand } from '../SlashCommandMenu'
import type { ProjectCommand } from '../../../../shared/commandTypes'

/**
 * Hook for managing custom and Claude SDK commands
 * Handles command execution, help text, and command list management
 */

type ClaudeMode = 'default' | 'acceptEdits' | 'plan'

interface UseCommandSystemOptions {
  agentId: string | undefined
  workingDir: string
  activeTerminalId?: string
  openRouterApiKey?: string
  onSendMessage: (content: string) => void
  onAddSystemMessage: (message: string) => void
  onClearMessages: () => void
  onModeChange: (mode: ClaudeMode) => void
  onModelChange: (model: string) => void
  gitOperations: {
    checkoutBranch: (branch: string) => Promise<boolean>
    createBranch: (branchName: string, checkout: boolean) => Promise<boolean>
    fetchBranches: () => Promise<string[]>
    getGitStatus: () => Promise<{ success: boolean; status?: string }>
  }
  worktreeOperations?: {
    listWorktrees: () => Promise<any[]>
  }
}

// Built-in custom commands
const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: 'help', description: 'Show all available commands' },
  { name: 'clear', description: 'Clear chat history' },
  { name: 'mode', description: 'Switch agent mode', argumentHint: '<default|acceptEdits|plan>' },
  { name: 'model', description: 'Switch model', argumentHint: '<opus|sonnet|haiku>' },
  { name: 'new-chat', description: 'Start new chat session' },
  { name: 'git-status', description: 'Show git status' },
  { name: 'checkout', description: 'Checkout git branches' },
  { name: 'branch', description: 'Create a new git branch', argumentHint: '<name>' },
  { name: 'worktree', description: 'Manage git worktrees' }
]

export function useCommandSystem({
  agentId,
  workingDir,
  activeTerminalId,
  openRouterApiKey,
  onSendMessage,
  onAddSystemMessage,
  onClearMessages,
  onModeChange,
  onModelChange,
  gitOperations,
  worktreeOperations
}: UseCommandSystemOptions) {
  const [claudeCommands, setClaudeCommands] = useState<SlashCommand[]>([])
  const [projectCommands, setProjectCommands] = useState<ProjectCommand[]>([])

  // Fetch Claude commands from SDK when agent is initialized
  useEffect(() => {
    if (!agentId) return

    window.electron.claude
      .getSupportedCommands(agentId)
      .then((result) => {
        if (result.commands) {
          setClaudeCommands(result.commands)
        }
      })
      .catch((error) => {
        console.error('[useCommandSystem] Failed to fetch Claude commands:', error)
      })
  }, [agentId])

  // Load project commands from .claude/commands/ when workingDir changes
  useEffect(() => {
    if (!workingDir) return

    window.electron.commands
      .get(workingDir)
      .then((commands) => {
        setProjectCommands(commands)
      })
      .catch((error) => {
        console.error('[useCommandSystem] Failed to load project commands:', error)
      })
  }, [workingDir])

  // Register listeners for workflow events (persistent for the lifetime of the hook)
  useEffect(() => {
    const unsubStepOutput = window.electron.commands.onStepOutput((data) => {
      const label = data.stepType === 'llm' ? `[LLM: ${data.stepId}]` : `[${data.stepId}]`
      onAddSystemMessage(`${label}\n${data.output}`)
    })

    const unsubDone = window.electron.commands.onDone((_data) => {
      onAddSystemMessage('Workflow complete')
    })

    const unsubError = window.electron.commands.onError((data) => {
      onAddSystemMessage(`Workflow error: ${data.error}`)
    })

    return () => {
      unsubStepOutput()
      unsubDone()
      unsubError()
    }
  }, [onAddSystemMessage])

  // Build merged custom commands list (built-in + project)
  const customCommands: SlashCommand[] = [
    ...BUILTIN_COMMANDS,
    ...projectCommands.map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
    }))
  ]

  // Format help text
  const formatHelpText = useCallback((custom: SlashCommand[], claude: SlashCommand[]): string => {
    let help = '**Custom Commands:**\n\n'
    custom.forEach((cmd) => {
      const args = cmd.argumentHint ? ` ${cmd.argumentHint}` : ''
      help += `• \`/${cmd.name}${args}\` - ${cmd.description}\n`
    })

    help += '\n**Claude Commands:**\n\n'
    if (claude.length === 0) {
      help += '• No Claude commands available\n'
    } else {
      claude.forEach((cmd) => {
        const args = cmd.argumentHint ? ` ${cmd.argumentHint}` : ''
        help += `• \`/${cmd.name}${args}\` - ${cmd.description}\n`
      })
    }

    return help
  }, [])

  // Execute a project-level command
  const executeProjectCommand = useCallback(
    (command: ProjectCommand, _args?: string) => {
      if (command.type === 'shell') {
        if (!activeTerminalId) {
          onAddSystemMessage('No active terminal. Open a terminal to run shell commands.')
          return
        }
        window.electron.pty.write(activeTerminalId, command.command + '\n').catch((err: any) => {
          console.error('[useCommandSystem] pty.write failed:', err)
        })
      } else if (command.type === 'workflow') {
        const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`
        onAddSystemMessage(`Running workflow: ${command.name}`)
        window.electron.commands
          .run(runId, workingDir, command.name, undefined, openRouterApiKey)
          .catch((err: any) => {
            onAddSystemMessage(`Failed to start workflow: ${err.message}`)
          })
      }
    },
    [activeTerminalId, workingDir, openRouterApiKey, onAddSystemMessage]
  )

  // Execute custom commands
  const executeCustomCommand = useCallback(
    (command: SlashCommand, args?: string) => {
      // Check if it's a project command first
      const projectCmd = projectCommands.find((c) => c.name === command.name)
      if (projectCmd) {
        executeProjectCommand(projectCmd, args)
        return
      }

      switch (command.name) {
        case 'help':
          {
            const helpText = formatHelpText(customCommands, claudeCommands)
            onAddSystemMessage(helpText)
          }
          break

        case 'clear':
          onClearMessages()
          onAddSystemMessage('Chat history cleared')
          break

        case 'mode':
          {
            const validModes = ['default', 'acceptEdits', 'plan']
            if (!args || !validModes.includes(args)) {
              onAddSystemMessage(`Usage: /mode <${validModes.join('|')}>`)
              return
            }
            onModeChange(args as ClaudeMode)
            if (agentId) {
              window.electron.claude.setMode(agentId, args).catch((err) => {
                console.error('[useCommandSystem] setMode failed:', err)
              })
            }
            onAddSystemMessage(`Mode changed to: ${args}`)
          }
          break

        case 'model':
          {
            const validModels = ['opus', 'sonnet', 'haiku']
            if (!args || !validModels.includes(args)) {
              onAddSystemMessage(`Usage: /model <${validModels.join('|')}>`)
              return
            }
            onModelChange(args)
            if (agentId) {
              window.electron.claude.setModel(agentId, args).catch((err) => {
                console.error('[useCommandSystem] setModel failed:', err)
              })
            }
            onAddSystemMessage(`Model changed to: ${args}`)
          }
          break

        case 'new-chat':
          onClearMessages()
          onAddSystemMessage('Started new chat session')
          break

        case 'git-status':
          gitOperations.getGitStatus()
          break

        case 'checkout':
          {
            if (args) {
              gitOperations.checkoutBranch(args)
              return
            }
            gitOperations.fetchBranches().then((branches) => {
              if (branches.length === 0) {
                onAddSystemMessage('No branches found')
              }
            })
          }
          break

        case 'branch':
          {
            if (!args) {
              onAddSystemMessage('Usage: /branch <name>')
              return
            }
            gitOperations.createBranch(args, true)
          }
          break

        case 'worktree':
          {
            if (worktreeOperations) {
              worktreeOperations.listWorktrees().then((worktrees) => {
                if (worktrees.length === 0) {
                  onAddSystemMessage('No worktrees found')
                }
              })
            } else {
              onAddSystemMessage('Worktree operations not available')
            }
          }
          break

        default:
          onAddSystemMessage(`Unknown command: ${command.name}`)
      }
    },
    [
      projectCommands,
      executeProjectCommand,
      formatHelpText,
      customCommands,
      claudeCommands,
      onAddSystemMessage,
      onClearMessages,
      onModeChange,
      onModelChange,
      gitOperations,
      worktreeOperations,
      agentId
    ]
  )

  // Execute Claude commands
  const executeClaudeCommand = useCallback(
    (command: SlashCommand, args?: string) => {
      const commandText = args ? `/${command.name} ${args}` : `/${command.name}`
      onSendMessage(commandText)
    },
    [onSendMessage]
  )

  // Handle command execution from InputBox
  const handleExecuteCommand = useCallback(
    (command: SlashCommand, category: 'custom' | 'claude', args?: string) => {
      console.log('[useCommandSystem] Executing command:', command.name, 'category:', category, 'args:', args)

      if (category === 'custom') {
        executeCustomCommand(command, args)
      } else {
        executeClaudeCommand(command, args)
      }
    },
    [executeCustomCommand, executeClaudeCommand]
  )

  // Handle command execution from input (Command/AI mode)
  const handleExecuteCommandFromInput = useCallback(
    async (command: string) => {
      console.log('[useCommandSystem] Executing command from input:', command)

      onAddSystemMessage(`$ ${command}`)

      const prompt = `Execute this shell command and show me the output:\n\n\`\`\`bash\n${command}\n\`\`\``
      onSendMessage(prompt)
    },
    [onAddSystemMessage, onSendMessage]
  )

  return {
    // State
    customCommands,
    claudeCommands,

    // Actions
    handleExecuteCommand,
    handleExecuteCommandFromInput
  }
}
