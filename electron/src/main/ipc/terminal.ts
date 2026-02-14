import { ipcMain, BrowserWindow } from 'electron'
import { PtyManager } from '../PtyManager'
import { IPC_CHANNELS } from '@shared/types'
import type { PtyOptions, PtyData, PtyResize } from '@shared/types'

export function setupTerminalIpc(ptyManager: PtyManager, mainWindow: BrowserWindow) {
  // Handle PTY spawn
  ipcMain.handle(IPC_CHANNELS.PTY_SPAWN, (_event, id: string, options: PtyOptions) => {
    try {
      const result = ptyManager.spawn(id, options)
      return { success: true, ...result }
    } catch (error) {
      console.error('Failed to spawn PTY:', error)
      return { success: false, error: String(error) }
    }
  })

  // Handle PTY write
  ipcMain.handle(IPC_CHANNELS.PTY_WRITE, (_event, id: string, data: string) => {
    try {
      const success = ptyManager.write(id, data)
      return { success }
    } catch (error) {
      console.error('Failed to write to PTY:', error)
      return { success: false, error: String(error) }
    }
  })

  // Handle PTY resize
  ipcMain.handle(IPC_CHANNELS.PTY_RESIZE, (_event, { terminalId, rows, cols }: PtyResize) => {
    try {
      const success = ptyManager.resize(terminalId, cols, rows)
      return { success }
    } catch (error) {
      console.error('Failed to resize PTY:', error)
      return { success: false, error: String(error) }
    }
  })

  // Handle PTY kill
  ipcMain.handle(IPC_CHANNELS.PTY_KILL, (_event, id: string) => {
    try {
      const success = ptyManager.kill(id)
      return { success }
    } catch (error) {
      console.error('Failed to kill PTY:', error)
      return { success: false, error: String(error) }
    }
  })

  // Forward PTY data to renderer
  ptyManager.on('data', (data: PtyData) => {
    mainWindow.webContents.send(IPC_CHANNELS.PTY_DATA, data)
  })

  // Forward PTY exit to renderer
  ptyManager.on('exit', (data: { terminalId: string; exitCode: number; signal?: number }) => {
    mainWindow.webContents.send(IPC_CHANNELS.PTY_EXIT, data)
  })
}
