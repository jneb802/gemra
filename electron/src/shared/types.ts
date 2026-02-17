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

  // Claude usage
  CLAUDE_USAGE: 'claude:usage',

  // Container status
  CONTAINER_STATUS: 'container:status',

  // Tool execution
  TOOL_STARTED: 'claude:tool-started',
  TOOL_COMPLETED: 'claude:tool-completed',
  TOOL_ERROR: 'claude:tool-error',
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]

// Quest Prompt types (for agent questions)
export interface QuestOption {
  label: string
  value: string
  description?: string
}

export interface QuestPrompt {
  id: string
  question: string
  header: string // Short label for UI
  description?: string
  answerType: 'text' | 'select' | 'multiselect' | 'confirm'
  options?: QuestOption[]
  required?: boolean
  multiSelect?: boolean
}

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

  // Tool execution history
  toolCalls?: ToolCall[]     // All tool calls made during this turn

  // Terminal block metadata (for block-based terminal)
  exitCode?: number
  duration?: number
  workingDir?: string
  isTerminalOutput?: boolean
  status?: string
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
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | MessageContent[]  // Support both text-only and multimodal
  id: string
  metadata?: MessageMetadata // Per-turn metadata
  timestamp?: number  // Optional timestamp for display
  questPrompt?: QuestPrompt  // If this message is a question
  questResponse?: string | string[]  // User's answer (when filled)
  toolCall?: ToolCall  // If this message represents a tool execution
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

// Tool execution output types
export interface BashOutput {
  stdout?: string
  stderr?: string
  exitCode?: number
}

export interface FileOutput {
  path: string
  content?: string
  linesRead?: number
}

export interface EditOutput {
  path: string
  diff?: string
  oldContent?: string
  newContent?: string
}

export interface GrepOutput {
  pattern: string
  matches?: Array<{ file: string; line: number; content: string }>
  matchCount?: number
}

export type ToolOutput = BashOutput | FileOutput | EditOutput | GrepOutput | string

// Tool execution tracking (basic version for status tracking)
export interface ToolExecution {
  id: string
  name: string
  input: any
  status: 'running' | 'completed' | 'error'
}

// Complete tool call record (for message history)
export interface ToolCall {
  id: string
  name: string  // 'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task', 'WebSearch', 'WebFetch'
  input: Record<string, any>  // Tool-specific parameters
  output?: ToolOutput  // Result or error message
  error?: string  // Error message if status is 'error'
  status: 'running' | 'completed' | 'error'
  startTime: number
  endTime?: number
  duration?: number  // Milliseconds
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
