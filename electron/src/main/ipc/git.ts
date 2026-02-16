import { ipcMain } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export function setupGitIpc() {
  // Clone repository
  ipcMain.handle('git:clone', async (_, url: string, targetPath: string) => {
    try {
      await execAsync(`git clone "${url}" "${targetPath}"`)
      return { success: true, path: targetPath }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Git clone failed'
      }
    }
  })

  // Initialize git repository
  ipcMain.handle('git:init', async (_, dirPath: string) => {
    try {
      await execAsync(`git init "${dirPath}"`)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Git init failed'
      }
    }
  })

  // Get current branch
  ipcMain.handle('git:get-branch', async (_, dirPath: string) => {
    try {
      const { stdout } = await execAsync('git branch --show-current', {
        cwd: dirPath
      })
      return { success: true, branch: stdout.trim() }
    } catch (error) {
      return { success: false, branch: null }
    }
  })
}
