import { ipcMain, BrowserWindow } from 'electron'
import { execSync } from 'child_process'
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

      await agent.sendPrompt(prompt)

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

  // Get git branch for a working directory
  ipcMain.handle('claude:get-git-branch', async (_, workingDir: string) => {
    try {
      console.log(`[ClaudeIPC] Getting git branch for ${workingDir}`)

      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: workingDir,
        encoding: 'utf-8',
      }).trim()

      return {
        success: true,
        branch,
      }
    } catch (error: any) {
      console.error('[ClaudeIPC] Failed to get git branch:', error)
      return {
        success: false,
        branch: 'unknown',
      }
    }
  })

  // Get git stats (files changed, insertions, deletions)
  ipcMain.handle('claude:get-git-stats', async (_, workingDir: string) => {
    try {
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

      return {
        success: true,
        filesChanged,
        insertions,
        deletions,
      }
    } catch (error: any) {
      console.error('[ClaudeIPC] Failed to get git stats:', error)
      return {
        success: false,
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
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
