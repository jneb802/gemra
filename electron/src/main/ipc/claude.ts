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
