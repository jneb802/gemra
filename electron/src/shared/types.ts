// Shared types between main and renderer processes

export interface PtyOptions {
  rows: number
  cols: number
  cwd?: string
  env?: Record<string, string>
}

export interface PtyData {
  terminalId: string
  data: string
}

export interface PtyResize {
  terminalId: string
  rows: number
  cols: number
}

export interface TerminalInfo {
  id: string
  title: string
  pid: number
}

// IPC Channel names
export const IPC_CHANNELS = {
  // PTY operations
  PTY_SPAWN: 'pty:spawn',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_KILL: 'pty:kill',
  PTY_DATA: 'pty:data',
  PTY_EXIT: 'pty:exit',

  // Terminal operations
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_CLOSE: 'terminal:close',
  TERMINAL_LIST: 'terminal:list',

  // File browser operations
  FILE_READ_DIR: 'file:readDir',
  FILE_STAT: 'file:stat',
  FILE_OPEN: 'file:open',

  // Window operations
  WINDOW_CLOSE: 'window:close',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
