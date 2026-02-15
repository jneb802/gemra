import { BrowserWindow } from 'electron'
import { ClaudeAgent } from '../agent/ClaudeAgent'
import { createIpcHandler } from '../utils/ipcUtils'
import { generateId } from '../../shared/utils/id'

// Map of agent ID to agent instance
const agents = new Map<string, ClaudeAgent>()

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
    console.log(`[ClaudeIPC] Agent ${agentId} text:`, text)
    mainWindow.webContents.send('claude:text', { agentId, text })
  })

  // Listen for status changes
  agent.on('status', (status: string) => {
    console.log(`[ClaudeIPC] Agent ${agentId} status:`, status)
    mainWindow.webContents.send('claude:status', { agentId, status })
  })

  // Listen for errors
  agent.on('error', (error: Error) => {
    console.error(`[ClaudeIPC] Agent ${agentId} error:`, error)
    mainWindow.webContents.send('claude:error', {
      agentId,
      error: error.message,
    })
  })

  // Listen for exit
  agent.on('exit', (info: any) => {
    console.log(`[ClaudeIPC] Agent ${agentId} exited:`, info)
    agents.delete(agentId)
    mainWindow.webContents.send('claude:exit', { agentId, info })
  })
}

/**
 * Setup IPC handlers for Claude Code integration
 */
export function setupClaudeIpc(mainWindow: BrowserWindow): void {
  console.log('[ClaudeIPC] Setting up IPC handlers...')

  // Start a new Claude agent
  createIpcHandler('claude:start', async (workingDir: string) => {
    const agentId = generateId.agent()
    console.log(`[ClaudeIPC] Starting agent ${agentId} in ${workingDir}`)

    const agent = new ClaudeAgent(agentId, {
      workingDirectory: workingDir,
    })

    // Forward agent events to renderer
    forwardAgentEvents(agent, agentId, mainWindow)

    // Start the agent
    await agent.start()

    // Store agent instance
    agents.set(agentId, agent)

    return { agentId }
  })

  // Send a prompt to an agent
  createIpcHandler('claude:send', async (agentId: string, prompt: string) => {
    console.log(`[ClaudeIPC] Sending prompt to agent ${agentId}:`, prompt)

    const agent = agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    agent.sendPrompt(prompt)
    return {}
  })

  // Stop an agent
  createIpcHandler('claude:stop', async (agentId: string) => {
    console.log(`[ClaudeIPC] Stopping agent ${agentId}`)

    const agent = agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    await agent.stop()
    agents.delete(agentId)

    return {}
  })

  // Get git branch
  createIpcHandler('claude:get-git-branch', async (workingDir: string) => {
    const { execSync } = require('child_process')
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: workingDir,
        encoding: 'utf-8',
      }).trim()
      return { branch }
    } catch (error) {
      return { branch: 'unknown' }
    }
  })

  // Get git stats
  createIpcHandler('claude:get-git-stats', async (workingDir: string) => {
    const { execSync } = require('child_process')
    try {
      const stats = execSync('git diff --shortstat', {
        cwd: workingDir,
        encoding: 'utf-8',
      }).trim()

      // Parse stats like "3 files changed, 25 insertions(+), 10 deletions(-)"
      const filesMatch = stats.match(/(\d+) files? changed/)
      const insertionsMatch = stats.match(/(\d+) insertions?/)
      const deletionsMatch = stats.match(/(\d+) deletions?/)

      return {
        filesChanged: filesMatch ? parseInt(filesMatch[1]) : 0,
        insertions: insertionsMatch ? parseInt(insertionsMatch[1]) : 0,
        deletions: deletionsMatch ? parseInt(deletionsMatch[1]) : 0,
      }
    } catch (error) {
      return { filesChanged: 0, insertions: 0, deletions: 0 }
    }
  })

  console.log('[ClaudeIPC] IPC handlers set up successfully')
}

/**
 * Clean up all agents
 */
export async function cleanupClaudeAgents(): Promise<void> {
  console.log('[ClaudeIPC] Cleaning up all agents...')

  const promises = Array.from(agents.values()).map((agent) => agent.stop())
  await Promise.all(promises)

  agents.clear()
  console.log('[ClaudeIPC] All agents cleaned up')
}
