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

  // Menu event listeners
  onMenuEvent: (channel: string, callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  // Platform info
  platform: process.platform,

  // Claude Code operations
  claude: {
    start: (workingDir: string) =>
      ipcRenderer.invoke('claude:start', workingDir),

    send: (agentId: string, prompt: string) =>
      ipcRenderer.invoke('claude:send', agentId, prompt),

    stop: (agentId: string) =>
      ipcRenderer.invoke('claude:stop', agentId),

    onText: (callback: (data: { agentId: string; text: string }) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: { agentId: string; text: string }) =>
        callback(data)
      ipcRenderer.on('claude:text', subscription)
      return () => ipcRenderer.removeListener('claude:text', subscription)
    },

    onStatus: (callback: (data: { agentId: string; status: string }) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: { agentId: string; status: string }) =>
        callback(data)
      ipcRenderer.on('claude:status', subscription)
      return () => ipcRenderer.removeListener('claude:status', subscription)
    },

    onError: (callback: (data: { agentId: string; error: string }) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: { agentId: string; error: string }) =>
        callback(data)
      ipcRenderer.on('claude:error', subscription)
      return () => ipcRenderer.removeListener('claude:error', subscription)
    },

    onExit: (callback: (data: { agentId: string; info: any }) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: { agentId: string; info: any }) =>
        callback(data)
      ipcRenderer.on('claude:exit', subscription)
      return () => ipcRenderer.removeListener('claude:exit', subscription)
    },
  },
})

// Type definitions for TypeScript
export interface ElectronAPI {
  pty: {
    spawn: (id: string, options: PtyOptions) => Promise<{ success: boolean; pid?: number; error?: string }>
    write: (id: string, data: string) => Promise<{ success: boolean; error?: string }>
    resize: (resize: PtyResize) => Promise<{ success: boolean; error?: string }>
    kill: (id: string) => Promise<{ success: boolean; error?: string }>
    onData: (callback: (data: PtyData) => void) => () => void
    onExit: (callback: (data: { terminalId: string; exitCode: number }) => void) => () => void
  }
  onMenuEvent: (channel: string, callback: () => void) => () => void
  platform: string
  claude: {
    start: (workingDir: string) => Promise<{ success: boolean; agentId?: string; error?: string }>
    send: (agentId: string, prompt: string) => Promise<{ success: boolean; error?: string }>
    stop: (agentId: string) => Promise<{ success: boolean; error?: string }>
    onText: (callback: (data: { agentId: string; text: string }) => void) => () => void
    onStatus: (callback: (data: { agentId: string; status: string }) => void) => () => void
    onError: (callback: (data: { agentId: string; error: string }) => void) => () => void
    onExit: (callback: (data: { agentId: string; info: any }) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
