import { BrowserWindow } from 'electron'
import { ClaudeAgent } from '../agent/ClaudeAgent'
import { createIpcHandler } from '../utils/ipcUtils'
import { generateId } from '../../shared/utils/id'
import { getGitBranch, getGitStats } from '../utils/gitUtils'
import { Logger } from '../../shared/utils/logger'

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
  // Listen for text responses from agent
  agent.on('text', (text: string) => {
    logger.log(`Agent ${agentId} text:`, text)
    safeSend(mainWindow, 'claude:text', { agentId, text })
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
    agents.delete(agentId)
    safeSend(mainWindow, 'claude:exit', { agentId, info })
  })

  // Listen for container status changes
  agent.on('containerStatus', (data: { status: string; error?: string }) => {
    logger.log(`Agent ${agentId} container status:`, data)
    safeSend(mainWindow, 'container:status', { agentId, ...data })
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

      return { agentId }
    }
  )

  // Send a prompt to an agent
  createIpcHandler('claude:send', async (agentId: string, prompt: string) => {
    logger.log(`Sending prompt to agent ${agentId}:`, prompt)

    const agent = getAgentOrThrow(agentId)
    await agent.sendPrompt(prompt)
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
