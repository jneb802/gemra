import { BrowserWindow } from 'electron'
import { PtyManager } from '../PtyManager'
import { IPC_CHANNELS } from '@shared/types'
import type { PtyOptions, PtyData, PtyResize } from '@shared/types'
import { createIpcHandler } from '../utils/ipcUtils'

export function setupTerminalIpc(ptyManager: PtyManager, mainWindow: BrowserWindow) {
  // Handle PTY spawn
  createIpcHandler(IPC_CHANNELS.PTY_SPAWN, (id: string, options: PtyOptions) => {
    return ptyManager.spawn(id, options)
  })

  // Handle PTY write
  createIpcHandler(IPC_CHANNELS.PTY_WRITE, (id: string, data: string) => {
    const success = ptyManager.write(id, data)
    return { success }
  })

  // Handle PTY resize
  createIpcHandler(IPC_CHANNELS.PTY_RESIZE, ({ terminalId, rows, cols }: PtyResize) => {
    const success = ptyManager.resize(terminalId, cols, rows)
    return { success }
  })

  // Handle PTY kill
  createIpcHandler(IPC_CHANNELS.PTY_KILL, (id: string) => {
    const success = ptyManager.kill(id)
    return { success }
  })

  // Forward PTY data to renderer (with safety check)
  const handlePtyData = (data: PtyData) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PTY_DATA, data)
    }
  }
  ptyManager.on('data', handlePtyData)

  // Forward PTY exit to renderer (with safety check)
  const handlePtyExit = (data: { terminalId: string; exitCode: number; signal?: number }) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PTY_EXIT, data)
    }
  }
  ptyManager.on('exit', handlePtyExit)

  // Clean up event listeners when window is closing
  mainWindow.on('close', () => {
    ptyManager.removeListener('data', handlePtyData)
    ptyManager.removeListener('exit', handlePtyExit)
    ptyManager.killAll()
  })
}
