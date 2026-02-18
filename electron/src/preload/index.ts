import { contextBridge, ipcRenderer } from 'electron'
import os from 'os'
import { IPC_CHANNELS } from '@shared/types'
import type { PtyOptions, PtyData, PtyResize, MessageContent } from '@shared/types'

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

  // Home directory (resolved at preload time)
  homeDir: os.homedir(),

  // Dialog operations
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
    createDirectory: (path: string) => ipcRenderer.invoke('dialog:create-directory', path),
    checkDirectory: (path: string) => ipcRenderer.invoke('dialog:check-directory', path),
  },

  // Git operations
  git: {
    clone: (url: string, targetPath: string) => ipcRenderer.invoke('git:clone', url, targetPath),
    init: (path: string) => ipcRenderer.invoke('git:init', path),
    getBranch: (path: string) => ipcRenderer.invoke('git:get-branch', path),
  },

  // Shell integration operations
  shellIntegration: {
    getStatus: () => ipcRenderer.invoke('shell-integration:get-status'),
    enable: () => ipcRenderer.invoke('shell-integration:enable'),
    disable: () => ipcRenderer.invoke('shell-integration:disable'),
    installScripts: () => ipcRenderer.invoke('shell-integration:install-scripts'),
  },

  // Custom slash commands
  commands: {
    get: (workingDir: string) =>
      ipcRenderer.invoke('commands:get', workingDir),

    run: (runId: string, workingDir: string, name: string, args?: string, apiKey?: string) =>
      ipcRenderer.invoke('commands:run', runId, workingDir, name, args, apiKey),

    cancel: (runId: string) =>
      ipcRenderer.invoke('commands:cancel', runId),

    onStepStart: createIpcListener<{ runId: string; stepId: string; model: string }>('commands:step-start'),

    onStepOutput: createIpcListener<{ runId: string; stepId: string; output: string; stepType: 'shell' | 'llm'; command?: string }>('commands:step-output'),

    onDone: createIpcListener<{ runId: string }>('commands:done'),

    onError: createIpcListener<{ runId: string; error: string }>('commands:error'),
  },

  // Claude Code operations
  claude: {
    start: (workingDir: string, profileId?: string, useDocker?: boolean, model?: string) =>
      ipcRenderer.invoke('claude:start', workingDir, profileId, useDocker, model),

    send: (agentId: string, content: string | MessageContent[]) =>
      ipcRenderer.invoke('claude:send', agentId, content),

    stop: (agentId: string) =>
      ipcRenderer.invoke('claude:stop', agentId),

    getGitBranch: (workingDir: string) =>
      ipcRenderer.invoke('claude:get-git-branch', workingDir),

    getGitStats: (workingDir: string) =>
      ipcRenderer.invoke('claude:get-git-stats', workingDir),

    getSupportedCommands: (agentId: string) =>
      ipcRenderer.invoke('claude:get-supported-commands', agentId),

    getGitBranches: (workingDir: string) =>
      ipcRenderer.invoke('claude:get-git-branches', workingDir),

    checkoutBranch: (workingDir: string, branch: string) =>
      ipcRenderer.invoke('claude:checkout-branch', workingDir, branch),

    createBranch: (workingDir: string, branchName: string, checkout: boolean) =>
      ipcRenderer.invoke('claude:create-branch', workingDir, branchName, checkout),

    listWorktrees: (workingDir: string) =>
      ipcRenderer.invoke('claude:list-worktrees', workingDir),

    addWorktree: (workingDir: string, path: string, branch: string) =>
      ipcRenderer.invoke('claude:add-worktree', workingDir, path, branch),

    removeWorktree: (workingDir: string, path: string) =>
      ipcRenderer.invoke('claude:remove-worktree', workingDir, path),

    pruneWorktrees: (workingDir: string) =>
      ipcRenderer.invoke('claude:prune-worktrees', workingDir),

    getPermissionsMode: () =>
      ipcRenderer.invoke('claude:get-permissions-mode'),

    onText: createIpcListener<{ agentId: string; text: string }>('claude:text'),

    onStatus: createIpcListener<{ agentId: string; status: string }>('claude:status'),

    onUsage: createIpcListener<{ agentId: string; usage: { inputTokens: number; outputTokens: number; timestamp: number } }>('claude:usage'),

    onAgentStatus: createIpcListener<{ agentId: string; status: any }>('claude:agentStatus'),

    onToolExecution: createIpcListener<{ agentId: string; tool: any }>('claude:toolExecution'),

    onToolStarted: createIpcListener<{ agentId: string; toolCall: any }>('claude:tool-started'),

    onToolCompleted: createIpcListener<{ agentId: string; toolCall: any }>('claude:tool-completed'),

    onError: createIpcListener<{ agentId: string; error: string }>('claude:error'),

    onExit: createIpcListener<{ agentId: string; info: any }>('claude:exit'),

    onContainerStatus: createIpcListener<{ agentId: string; status: string; error?: string }>('container:status'),

    respondToQuest: (agentId: string, questId: string, optionId: string) =>
      ipcRenderer.invoke('claude:respond-quest', agentId, questId, optionId),

    cancel: (agentId: string) =>
      ipcRenderer.invoke('claude:cancel', { agentId }),

    setMode: (agentId: string, modeId: string) =>
      ipcRenderer.invoke('claude:set-mode', { agentId, modeId }),

    setModel: (agentId: string, modelId: string) =>
      ipcRenderer.invoke('claude:set-model', { agentId, modelId }),

    onQuestPrompt: createIpcListener<{ agentId: string; questId: string; prompt: any }>('claude:quest-prompt'),
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
  commands: {
    get: (workingDir: string) => Promise<import('../shared/commandTypes').ProjectCommand[]>
    run: (runId: string, workingDir: string, name: string, args?: string, apiKey?: string) => Promise<{ success: boolean; error?: string }>
    cancel: (runId: string) => Promise<{ success: boolean; error?: string }>
    onStepStart: (callback: (data: { runId: string; stepId: string; model: string }) => void) => () => void
    onStepOutput: (callback: (data: { runId: string; stepId: string; output: string; stepType: 'shell' | 'llm'; command?: string }) => void) => () => void
    onDone: (callback: (data: { runId: string }) => void) => () => void
    onError: (callback: (data: { runId: string; error: string }) => void) => () => void
  }
  onMenuEvent: (channel: string, callback: () => void) => () => void
  platform: string
  homeDir: string
  dialog: {
    selectDirectory: () => Promise<{ success: boolean; path: string | null; error?: string }>
    createDirectory: (path: string) => Promise<{ success: boolean; path?: string; error?: string }>
    checkDirectory: (path: string) => Promise<{ success: boolean; exists: boolean; error?: string }>
  }
  git: {
    clone: (url: string, targetPath: string) => Promise<{ success: boolean; path?: string; error?: string }>
    init: (path: string) => Promise<{ success: boolean; error?: string }>
    getBranch: (path: string) => Promise<{ success: boolean; branch?: string; error?: string }>
  }
  shellIntegration: {
    getStatus: () => Promise<{ shell: string; installed: boolean; scriptsPath: string }>
    enable: () => Promise<{ success: boolean; error?: string }>
    disable: () => Promise<{ success: boolean; error?: string }>
    installScripts: () => Promise<{ success: boolean; error?: string }>
  }
  claude: {
    start: (workingDir: string, profileId?: string, useDocker?: boolean, model?: string) => Promise<{ success: boolean; agentId?: string; error?: string }>
    send: (agentId: string, content: string | MessageContent[]) => Promise<{ success: boolean; error?: string }>
    stop: (agentId: string) => Promise<{ success: boolean; error?: string }>
    getGitBranch: (workingDir: string) => Promise<{ success: boolean; branch: string }>
    getGitStats: (workingDir: string) => Promise<{ success: boolean; filesChanged: number; insertions: number; deletions: number }>
    getSupportedCommands: (agentId: string) => Promise<{ commands: any[] }>
    getGitBranches: (workingDir: string) => Promise<{ success: boolean; branches: string[] }>
    checkoutBranch: (workingDir: string, branch: string) => Promise<{ success: boolean; branch?: string; error?: string }>
    createBranch: (workingDir: string, branchName: string, checkout: boolean) => Promise<{ success: boolean; branch?: string; error?: string }>
    listWorktrees: (workingDir: string) => Promise<{ worktrees: Array<{ path: string; branch: string; commit: string; isMain: boolean }> }>
    addWorktree: (workingDir: string, path: string, branch: string) => Promise<{ success: boolean; error?: string }>
    removeWorktree: (workingDir: string, path: string) => Promise<{ success: boolean; error?: string }>
    pruneWorktrees: (workingDir: string) => Promise<{ success: boolean; error?: string }>
    getPermissionsMode: () => Promise<{ dangerouslySkipPermissions: boolean }>
    onText: (callback: (data: { agentId: string; text: string }) => void) => () => void
    onStatus: (callback: (data: { agentId: string; status: string }) => void) => () => void
    onUsage: (callback: (data: { agentId: string; usage: { inputTokens: number; outputTokens: number; timestamp: number } }) => void) => () => void
    onAgentStatus: (callback: (data: { agentId: string; status: any }) => void) => () => void
    onToolExecution: (callback: (data: { agentId: string; tool: any }) => void) => () => void
    onToolStarted: (callback: (data: { agentId: string; toolCall: any }) => void) => () => void
    onToolCompleted: (callback: (data: { agentId: string; toolCall: any }) => void) => () => void
    onError: (callback: (data: { agentId: string; error: string }) => void) => () => void
    onExit: (callback: (data: { agentId: string; info: any }) => void) => () => void
    onContainerStatus: (callback: (data: { agentId: string; status: string; error?: string }) => void) => () => void
    respondToQuest: (agentId: string, questId: string, optionId: string) => Promise<{ success: boolean; error?: string }>
    cancel: (agentId: string) => Promise<{ success: boolean; error?: string }>
    setMode: (agentId: string, modeId: string) => Promise<{ success: boolean; error?: string }>
    setModel: (agentId: string, modelId: string) => Promise<{ success: boolean; error?: string }>
    onQuestPrompt: (callback: (data: { agentId: string; questId: string; prompt: any }) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
