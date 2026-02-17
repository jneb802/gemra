import { BrowserWindow } from 'electron'
import { ClaudeAgent } from '../agent/ClaudeAgent'
import { createIpcHandler } from '../utils/ipcUtils'
import { generateId } from '../../shared/utils/id'
import { getGitBranch, getGitStats, getGitBranches, checkoutBranch, createBranch, listWorktrees, addWorktree, removeWorktree, pruneWorktrees } from '../utils/gitUtils'
import { Logger } from '../../shared/utils/logger'
import type { MessageContent } from '../../shared/types'

// Map of agent ID to agent instance
const agents = new Map<string, ClaudeAgent>()

// Logger instance
const logger = new Logger('ClaudeIPC')

/**
 * Get agent by ID or throw error
 */
function getAgentOrThrow(agentId: string): ClaudeAgent {
  const agent = agents.get(agentId)
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`)
  }
  return agent
}

/**
 * Safely send IPC message to renderer (prevents crash if window is destroyed)
 */
function safeSend(mainWindow: BrowserWindow, channel: string, data: any): void {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

/**
 * Forward agent events to the renderer process
 */
function forwardAgentEvents(
  agent: ClaudeAgent,
  agentId: string,
  mainWindow: BrowserWindow
): void {
  // Batch text chunks to prevent IPC flooding during fast streaming
  let textBuffer = ''
  let flushTimeout: NodeJS.Timeout | null = null

  const flushTextBuffer = () => {
    if (textBuffer.length > 0) {
      safeSend(mainWindow, 'claude:text', { agentId, text: textBuffer })
      textBuffer = ''
    }
    flushTimeout = null
  }

  // Listen for text responses from agent
  agent.on('text', (text: string) => {
    logger.log(`Agent ${agentId} text:`, text)
    textBuffer += text

    // Clear existing timeout
    if (flushTimeout) {
      clearTimeout(flushTimeout)
    }

    // Flush immediately if buffer is large, otherwise batch for 16ms (60fps)
    if (textBuffer.length > 500) {
      flushTextBuffer()
    } else {
      flushTimeout = setTimeout(flushTextBuffer, 16)
    }
  })

  // Listen for status changes
  agent.on('status', (status: string) => {
    logger.log(`Agent ${agentId} status:`, status)
    safeSend(mainWindow, 'claude:status', { agentId, status })
  })

  // Listen for token usage
  agent.on('usage', (usage: any) => {
    logger.log(`Agent ${agentId} usage:`, usage)
    safeSend(mainWindow, 'claude:usage', { agentId, usage })
  })

  // Listen for agent status changes (thinking, tool execution, streaming)
  agent.on('agentStatus', (status: any) => {
    logger.log(`Agent ${agentId} agentStatus:`, status)
    safeSend(mainWindow, 'claude:agentStatus', { agentId, status })
  })

  // Listen for tool executions
  agent.on('toolExecution', (tool: any) => {
    logger.log(`Agent ${agentId} toolExecution:`, tool)
    safeSend(mainWindow, 'claude:toolExecution', { agentId, tool })
  })

  // Listen for tool started events
  agent.on('tool-started', (toolCall: any) => {
    logger.log(`Agent ${agentId} tool-started:`, toolCall)
    safeSend(mainWindow, 'claude:tool-started', { agentId, toolCall })
  })

  // Listen for tool completed events
  agent.on('tool-completed', (toolCall: any) => {
    logger.log(`Agent ${agentId} tool-completed:`, toolCall)
    safeSend(mainWindow, 'claude:tool-completed', { agentId, toolCall })
  })

  // Listen for errors
  agent.on('error', (error: Error) => {
    logger.error(`Agent ${agentId} error:`, error)
    safeSend(mainWindow, 'claude:error', {
      agentId,
      error: error.message,
    })
  })

  // Listen for exit
  agent.on('exit', (info: any) => {
    logger.log(`Agent ${agentId} exited:`, info)

    // Flush any remaining text
    if (flushTimeout) {
      clearTimeout(flushTimeout)
      flushTextBuffer()
    }

    agents.delete(agentId)
    safeSend(mainWindow, 'claude:exit', { agentId, info })
  })

  // Listen for container status changes
  agent.on('containerStatus', (data: { status: string; error?: string }) => {
    logger.log(`Agent ${agentId} container status:`, data)
    safeSend(mainWindow, 'container:status', { agentId, ...data })
  })

  // Listen for quest prompts (agent asking questions)
  agent.on('questPrompt', (data: { questId: string; prompt: any }) => {
    logger.log(`Agent ${agentId} quest prompt:`, data.questId)
    safeSend(mainWindow, 'claude:quest-prompt', { agentId, questId: data.questId, prompt: data.prompt })
  })
}

/**
 * Setup IPC handlers for Claude Code integration
 */
export function setupClaudeIpc(mainWindow: BrowserWindow): void {
  logger.log('Setting up IPC handlers...')

  // Start a new Claude agent
  createIpcHandler(
    'claude:start',
    async (workingDir: string, profileId?: string, useDocker?: boolean) => {
      const agentId = generateId.agent()
      logger.log(
        `Starting agent ${agentId} in ${workingDir} with profile ${profileId || 'anthropic'} (Docker: ${useDocker})`
      )

      try {
        const agent = new ClaudeAgent(agentId, {
          workingDirectory: workingDir,
          profileId: profileId,
          dockerOptions: useDocker ? { enabled: true } : undefined,
        })

        // Forward agent events to renderer
        forwardAgentEvents(agent, agentId, mainWindow)

        // Start the agent
        await agent.start()

        // Store agent instance
        agents.set(agentId, agent)

        return { success: true, agentId }
      } catch (error) {
        logger.error(`Failed to start agent ${agentId}:`, error)
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
  )

  // Send a prompt to an agent (supports text or multimodal content)
  createIpcHandler('claude:send', async (agentId: string, content: string | MessageContent[]) => {
    logger.log(`Sending content to agent ${agentId}:`, typeof content === 'string' ? content : `[${content.length} blocks]`)

    const agent = getAgentOrThrow(agentId)
    await agent.sendPrompt(content)
    return {}
  })

  // Stop an agent
  createIpcHandler('claude:stop', async (agentId: string) => {
    logger.log(`Stopping agent ${agentId}`)

    const agent = getAgentOrThrow(agentId)
    await agent.stop()
    agents.delete(agentId)

    return {}
  })

  // Get git branch
  createIpcHandler('claude:get-git-branch', async (workingDir: string) => {
    logger.log(`Getting git branch for ${workingDir}`)

    const branch = getGitBranch(workingDir)
    return { branch }
  })

  // Get git stats
  createIpcHandler('claude:get-git-stats', async (workingDir: string) => {
    logger.log(`Getting git stats for ${workingDir}`)

    const stats = getGitStats(workingDir)
    return stats
  })

  // Get supported slash commands
  createIpcHandler('claude:get-supported-commands', async (agentId: string) => {
    logger.log(`Getting supported commands for agent ${agentId}`)

    const agent = getAgentOrThrow(agentId)
    const commands = await agent.getSupportedCommands()
    return { commands }
  })

  // Respond to quest prompt
  createIpcHandler('claude:respond-quest', async (agentId: string, questId: string, response: string | string[]) => {
    logger.log(`Quest response for agent ${agentId}, quest ${questId}:`, response)

    const agent = getAgentOrThrow(agentId)

    // For now, we'll send the response as a regular message
    // This assumes the agent SDK will handle the response appropriately
    // If the Claude Agent SDK has a specific method for quest responses, use that instead
    const formattedResponse = Array.isArray(response)
      ? `Selected: ${response.join(', ')}`
      : response

    await agent.sendPrompt(formattedResponse)

    return { success: true }
  })

  // Get git branches
  createIpcHandler('claude:get-git-branches', async (workingDir: string) => {
    logger.log(`Getting git branches for ${workingDir}`)

    const branches = getGitBranches(workingDir)
    return { branches }
  })

  // Checkout git branch
  createIpcHandler('claude:checkout-branch', async (workingDir: string, branch: string) => {
    logger.log(`Checking out branch ${branch} in ${workingDir}`)

    const result = checkoutBranch(workingDir, branch)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    const newBranch = getGitBranch(workingDir)
    return { success: true, branch: newBranch }
  })

  // Create git branch
  createIpcHandler('claude:create-branch', async (workingDir: string, branchName: string, checkout: boolean) => {
    logger.log(`Creating branch ${branchName} in ${workingDir} (checkout: ${checkout})`)

    const result = createBranch(workingDir, branchName, checkout)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    const newBranch = getGitBranch(workingDir)
    return { success: true, branch: newBranch }
  })

  // List git worktrees
  createIpcHandler('claude:list-worktrees', async (workingDir: string) => {
    logger.log(`Listing worktrees for ${workingDir}`)

    const worktrees = listWorktrees(workingDir)
    return { worktrees }
  })

  // Add git worktree
  createIpcHandler('claude:add-worktree', async (workingDir: string, path: string, branch: string) => {
    logger.log(`Adding worktree at ${path} for branch ${branch} in ${workingDir}`)

    const result = addWorktree(workingDir, path, branch)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true }
  })

  // Remove git worktree
  createIpcHandler('claude:remove-worktree', async (workingDir: string, path: string) => {
    logger.log(`Removing worktree at ${path} in ${workingDir}`)

    const result = removeWorktree(workingDir, path)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true }
  })

  // Prune git worktrees
  createIpcHandler('claude:prune-worktrees', async (workingDir: string) => {
    logger.log(`Pruning worktrees in ${workingDir}`)

    const result = pruneWorktrees(workingDir)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true }
  })

  // Check if dangerous skip permissions mode is enabled
  createIpcHandler('claude:get-permissions-mode', async () => {
    const dangerouslySkipPermissions = process.env.CLAUDE_SANDBOX === '1'
    return { dangerouslySkipPermissions }
  })

  logger.log('IPC handlers set up successfully')
}

/**
 * Clean up all agents
 */
export async function cleanupClaudeAgents(): Promise<void> {
  logger.log('Cleaning up all agents...')

  const promises = Array.from(agents.values()).map((agent) => agent.stop())
  await Promise.all(promises)

  agents.clear()
  logger.log('All agents cleaned up')
}
