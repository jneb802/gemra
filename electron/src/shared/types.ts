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

  // Window operations
  WINDOW_CLOSE: 'window:close',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',

  // Claude usage
  CLAUDE_USAGE: 'claude:usage',

  // Container status
  CONTAINER_STATUS: 'container:status',
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]

// Claude Agent types
export interface MessageMetadata {
  // Timing phases (milliseconds)
  thinkingTime?: number      // Time in 'thinking' state
  streamingTime?: number     // Time in 'streaming' state
  toolExecutionTime?: number // Total time executing tools
  totalDuration?: number     // Overall turn duration

  // Token usage for this turn
  inputTokens?: number
  outputTokens?: number

  // Live tracking state
  startTime?: number         // When user sent message
  phaseStartTime?: number    // When current phase started
  currentPhase?: 'thinking' | 'streaming' | 'tool_execution' | 'idle'

  // Status flag
  isComplete?: boolean       // Whether turn finished
}

// Multimodal message content blocks
export interface TextContent {
  type: 'text'
  text: string
}

export interface ImageSource {
  type: 'base64'
  media_type: string  // e.g., 'image/png', 'image/jpeg'
  data: string        // Base64-encoded image data (without data URL prefix)
}

export interface ImageContent {
  type: 'image'
  source: ImageSource
}

export type MessageContent = TextContent | ImageContent

export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | MessageContent[]  // Support both text-only and multimodal
  id: string
  metadata?: MessageMetadata // Per-turn metadata
}

export interface ClaudeAgentInfo {
  agentId: string
  workingDir: string
  status: 'idle' | 'working' | 'error'
}

export interface ClaudeAgentOptions {
  workingDir: string
  profileId?: string
}

export interface DockerOptions {
  enabled: boolean
  imageName?: string // Override auto-detected image
}

export type ContainerStatus = 'disabled' | 'building' | 'starting' | 'running' | 'error'

export interface ContainerState {
  status: ContainerStatus
  error?: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  timestamp: number
}

export interface ToolExecution {
  id: string
  name: string
  input: any
  status: 'running' | 'completed' | 'error'
}

export type AgentStatus =
  | { type: 'idle' }
  | { type: 'thinking' }
  | { type: 'tool_execution'; tool: ToolExecution }
  | { type: 'streaming' }

export interface ACPMessage {
  jsonrpc: '2.0'
  id?: string | number
  method?: string
  params?: any
  result?: {
    usage?: {
      input_tokens: number
      output_tokens: number
    }
    [key: string]: any
  }
  error?: {
    code: number
    message: string
  }
}
