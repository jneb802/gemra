import { ipcMain, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export function setupDialogIpc() {
  // Select directory dialog
  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Create directory
  ipcMain.handle('dialog:create-directory', async (_, dirPath: string) => {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true })
      return { success: true, path: dirPath }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Check if directory exists
  ipcMain.handle('dialog:check-directory', async (_, dirPath: string) => {
    try {
      const stats = await fs.promises.stat(dirPath)
      return stats.isDirectory()
    } catch {
      return false
    }
  })
}
