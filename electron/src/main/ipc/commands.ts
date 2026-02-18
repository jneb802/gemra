import { ipcMain, BrowserWindow } from 'electron'
import { loadCommands } from '../commands/CommandLoader'
import { runWorkflow } from '../commands/WorkflowRunner'
import type { WorkflowCommandDef } from '../../shared/commandTypes'

const activeRuns = new Map<string, AbortController>()

export function setupCommandsIpc(mainWindow: BrowserWindow): void {
  // Load commands from .claude/commands/ for a given working directory
  ipcMain.handle('commands:get', async (_event, workingDir: string) => {
    try {
      return loadCommands(workingDir)
    } catch (err) {
      console.error('[commands:get] Error loading commands:', err)
      return []
    }
  })

  // Run a workflow command
  ipcMain.handle(
    'commands:run',
    async (_event, runId: string, workingDir: string, commandName: string, _args: string | undefined, apiKey: string) => {
      const commands = loadCommands(workingDir)
      const command = commands.find((c) => c.name === commandName)

      if (!command) {
        mainWindow.webContents.send('commands:error', { runId, error: `Command not found: ${commandName}` })
        return { success: false, error: `Command not found: ${commandName}` }
      }

      if (command.type !== 'workflow') {
        mainWindow.webContents.send('commands:error', { runId, error: `Command "${commandName}" is not a workflow` })
        return { success: false, error: `Not a workflow command` }
      }

      const workflow = command as WorkflowCommandDef
      const controller = new AbortController()
      activeRuns.set(runId, controller)

      // Run asynchronously so IPC returns immediately
      runWorkflow(
        workflow.steps,
        workingDir,
        apiKey ?? process.env.OPENROUTER_API_KEY ?? '',
        (stepId, output, stepType) => {
          mainWindow.webContents.send('commands:step-output', { runId, stepId, output, stepType })
        },
        controller.signal
      )
        .then(() => {
          activeRuns.delete(runId)
          mainWindow.webContents.send('commands:done', { runId })
        })
        .catch((err: Error) => {
          activeRuns.delete(runId)
          mainWindow.webContents.send('commands:error', { runId, error: err.message })
        })

      return { success: true }
    }
  )

  // Cancel a running workflow
  ipcMain.handle('commands:cancel', async (_event, runId: string) => {
    const controller = activeRuns.get(runId)
    if (controller) {
      controller.abort()
      activeRuns.delete(runId)
      return { success: true }
    }
    return { success: false, error: 'Run not found' }
  })
}
