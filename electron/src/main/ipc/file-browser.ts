import { ipcMain, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { IPC_CHANNELS } from '@shared/types'

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  isHidden: boolean
}

export function setupFileBrowserIpc() {
  // Read directory contents
  ipcMain.handle(IPC_CHANNELS.FILE_READ_DIR, async (_event, dirPath: string) => {
    try {
      // Default to home directory if no path provided
      const targetPath = dirPath || os.homedir()

      const entries = await fs.promises.readdir(targetPath, { withFileTypes: true })

      const files: FileInfo[] = entries
        .map((entry) => ({
          name: entry.name,
          path: path.join(targetPath, entry.name),
          isDirectory: entry.isDirectory(),
          isHidden: entry.name.startsWith('.'),
        }))
        .sort((a, b) => {
          // Directories first, then alphabetically
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })

      return { success: true, files, path: targetPath }
    } catch (error) {
      console.error('Failed to read directory:', error)
      return { success: false, error: String(error), files: [], path: dirPath }
    }
  })

  // Get file/directory stats
  ipcMain.handle(IPC_CHANNELS.FILE_STAT, async (_event, filePath: string) => {
    try {
      const stats = await fs.promises.stat(filePath)
      return {
        success: true,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size,
        modified: stats.mtime,
      }
    } catch (error) {
      console.error('Failed to stat file:', error)
      return { success: false, error: String(error) }
    }
  })

  // Open file in default application
  ipcMain.handle(IPC_CHANNELS.FILE_OPEN, async (_event, filePath: string) => {
    try {
      await shell.openPath(filePath)
      return { success: true }
    } catch (error) {
      console.error('Failed to open file:', error)
      return { success: false, error: String(error) }
    }
  })
}
