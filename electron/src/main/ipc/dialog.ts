import { dialog } from 'electron'
import * as fs from 'fs'
import { createIpcHandler } from '../utils/ipcUtils'

export function setupDialogIpc() {
  // Select directory dialog
  createIpcHandler('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    return { path: result.canceled ? null : result.filePaths[0] }
  })

  // Create directory
  createIpcHandler('dialog:create-directory', async (dirPath: string) => {
    await fs.promises.mkdir(dirPath, { recursive: true })
    return { path: dirPath }
  })

  // Check if directory exists
  createIpcHandler('dialog:check-directory', async (dirPath: string) => {
    const stats = await fs.promises.stat(dirPath)
    return { exists: stats.isDirectory() }
  })
}
