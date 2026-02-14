import { ipcMain, BrowserWindow } from 'electron'
import { ClaudeAgent } from '../agent/ClaudeAgent'

// Map of agent ID to agent instance
const agents = new Map<string, ClaudeAgent>()

/**
 * Setup IPC handlers for Claude Code integration
 */
export function setupClaudeIpc(mainWindow: BrowserWindow): void {
  console.log('[ClaudeIPC] Setting up IPC handlers...')

  // Start a new Claude agent
  ipcMain.handle('claude:start', async (_, workingDir: string) => {
    try {
      const agentId = `agent-${Date.now()}`
      console.log(`[ClaudeIPC] Starting agent ${agentId} in ${workingDir}`)

      const agent = new ClaudeAgent(agentId, {
        workingDirectory: workingDir,
      })

      // Listen for text responses from agent
      agent.on('text', (text: string) => {
        console.log(`[ClaudeIPC] Agent ${agentId} text:`, text)
        mainWindow.webContents.send('claude:text', {
          agentId,
          text,
        })
      })

      // Listen for status changes
      agent.on('status', (status: string) => {
        console.log(`[ClaudeIPC] Agent ${agentId} status:`, status)
        mainWindow.webContents.send('claude:status', {
          agentId,
          status,
        })
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
        mainWindow.webContents.send('claude:exit', {
          agentId,
          info,
        })
      })

      // Start the agent
      await agent.start()

      // Store agent instance
      agents.set(agentId, agent)

      return {
        success: true,
        agentId,
      }
    } catch (error: any) {
      console.error('[ClaudeIPC] Failed to start agent:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  })

  // Send a prompt to an agent
  ipcMain.handle('claude:send', async (_, agentId: string, prompt: string) => {
    try {
      console.log(`[ClaudeIPC] Sending prompt to agent ${agentId}:`, prompt)

      const agent = agents.get(agentId)
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`)
      }

      agent.sendPrompt(prompt)

      return {
        success: true,
      }
    } catch (error: any) {
      console.error('[ClaudeIPC] Failed to send prompt:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  })

  // Stop an agent
  ipcMain.handle('claude:stop', async (_, agentId: string) => {
    try {
      console.log(`[ClaudeIPC] Stopping agent ${agentId}`)

      const agent = agents.get(agentId)
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`)
      }

      await agent.stop()
      agents.delete(agentId)

      return {
        success: true,
      }
    } catch (error: any) {
      console.error('[ClaudeIPC] Failed to stop agent:', error)
      return {
        success: false,
        error: error.message,
      }
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
