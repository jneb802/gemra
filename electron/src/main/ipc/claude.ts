import { BrowserWindow } from 'electron'
import { execSync } from 'child_process'
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

  // Listen for token usage
  agent.on('usage', (usage: any) => {
    console.log(`[ClaudeIPC] Agent ${agentId} usage:`, usage)
    mainWindow.webContents.send('claude:usage', { agentId, usage })
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

  // Listen for container status changes
  agent.on('containerStatus', (data: { status: string; error?: string }) => {
    console.log(`[ClaudeIPC] Agent ${agentId} container status:`, data)
    mainWindow.webContents.send('container:status', { agentId, ...data })
  })
}

/**
 * Setup IPC handlers for Claude Code integration
 */
export function setupClaudeIpc(mainWindow: BrowserWindow): void {
  console.log('[ClaudeIPC] Setting up IPC handlers...')

  // Start a new Claude agent
  createIpcHandler(
    'claude:start',
    async (workingDir: string, profileId?: string, useDocker?: boolean) => {
      const agentId = generateId.agent()
      console.log(
        `[ClaudeIPC] Starting agent ${agentId} in ${workingDir} with profile ${profileId || 'anthropic'} (Docker: ${useDocker})`
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
    console.log(`[ClaudeIPC] Sending prompt to agent ${agentId}:`, prompt)

    const agent = agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    await agent.sendPrompt(prompt)
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
    console.log(`[ClaudeIPC] Getting git branch for ${workingDir}`)

    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: workingDir,
      encoding: 'utf-8',
    }).trim()

    return { branch }
  })

  // Get git stats
  createIpcHandler('claude:get-git-stats', async (workingDir: string) => {
    console.log(`[ClaudeIPC] Getting git stats for ${workingDir}`)

    const shortstat = execSync('git diff --shortstat', {
      cwd: workingDir,
      encoding: 'utf-8',
    }).trim()

    // Parse output like: "3 files changed, 10 insertions(+), 5 deletions(-)"
    let filesChanged = 0
    let insertions = 0
    let deletions = 0

    if (shortstat) {
      const filesMatch = shortstat.match(/(\d+) files? changed/)
      const insertionsMatch = shortstat.match(/(\d+) insertions?/)
      const deletionsMatch = shortstat.match(/(\d+) deletions?/)

      filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0
      insertions = insertionsMatch ? parseInt(insertionsMatch[1]) : 0
      deletions = deletionsMatch ? parseInt(deletionsMatch[1]) : 0
    }

    return { filesChanged, insertions, deletions }
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
