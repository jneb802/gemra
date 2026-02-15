import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type { PtyOptions, PtyData, PtyResize } from '@shared/types'

/**
 * Helper function to create IPC event listeners with automatic cleanup
 */
function createIpcListener<T>(channel: string) {
  return (callback: (data: T) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: T) => callback(data)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  }
}

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

    onData: createIpcListener<PtyData>(IPC_CHANNELS.PTY_DATA),

    onExit: createIpcListener<{ terminalId: string; exitCode: number }>(IPC_CHANNELS.PTY_EXIT),
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

    getGitBranch: (workingDir: string) =>
      ipcRenderer.invoke('claude:get-git-branch', workingDir),

    getGitStats: (workingDir: string) =>
      ipcRenderer.invoke('claude:get-git-stats', workingDir),

    onText: createIpcListener<{ agentId: string; text: string }>('claude:text'),

    onStatus: createIpcListener<{ agentId: string; status: string }>('claude:status'),

    onError: createIpcListener<{ agentId: string; error: string }>('claude:error'),

    onExit: createIpcListener<{ agentId: string; info: any }>('claude:exit'),
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
    getGitBranch: (workingDir: string) => Promise<{ success: boolean; branch: string }>
    getGitStats: (workingDir: string) => Promise<{ success: boolean; filesChanged: number; insertions: number; deletions: number }>
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
