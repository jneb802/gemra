import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type { PtyOptions, PtyData, PtyResize } from '@shared/types'

// Expose protected methods via contextBridge
contextBridge.exposeInMainWorld('electron', {
  // PTY operations
  pty: {
    spawn: (id: string, options: PtyOptions) =>
      ipcRenderer.invoke(IPC_CHANNELS.PTY_SPAWN, id, options),

    write: (id: string, data: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PTY_WRITE, id, data),

    resize: (resize: PtyResize) =>
      ipcRenderer.invoke(IPC_CHANNELS.PTY_RESIZE, resize),

    kill: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PTY_KILL, id),

    onData: (callback: (data: PtyData) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: PtyData) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.PTY_DATA, subscription)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PTY_DATA, subscription)
    },

    onExit: (callback: (data: { terminalId: string; exitCode: number }) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: { terminalId: string; exitCode: number }) =>
        callback(data)
      ipcRenderer.on(IPC_CHANNELS.PTY_EXIT, subscription)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PTY_EXIT, subscription)
    },
  },

  // File browser operations
  fileBrowser: {
    readDir: (dirPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_DIR, dirPath),

    stat: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_STAT, filePath),

    open: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN, filePath),
  },

  // Menu event listeners
  onMenuEvent: (channel: string, callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  // Platform info
  platform: process.platform,
})

// Type definitions for TypeScript
export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  isHidden: boolean
}

export interface ElectronAPI {
  pty: {
    spawn: (id: string, options: PtyOptions) => Promise<{ success: boolean; pid?: number; error?: string }>
    write: (id: string, data: string) => Promise<{ success: boolean; error?: string }>
    resize: (resize: PtyResize) => Promise<{ success: boolean; error?: string }>
    kill: (id: string) => Promise<{ success: boolean; error?: string }>
    onData: (callback: (data: PtyData) => void) => () => void
    onExit: (callback: (data: { terminalId: string; exitCode: number }) => void) => () => void
  }
  fileBrowser: {
    readDir: (dirPath: string) => Promise<{ success: boolean; files: FileInfo[]; path: string; error?: string }>
    stat: (filePath: string) => Promise<{ success: boolean; isDirectory?: boolean; isFile?: boolean; size?: number; modified?: Date; error?: string }>
    open: (filePath: string) => Promise<{ success: boolean; error?: string }>
  }
  onMenuEvent: (channel: string, callback: () => void) => () => void
  platform: string
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
