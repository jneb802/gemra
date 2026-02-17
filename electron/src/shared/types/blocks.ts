// Terminal Block Types
// Block-based terminal support with OSC 133 shell integration

export type BlockType =
  | 'command'      // User command input
  | 'output'       // Command output
  | 'system'       // System message (process exit, etc.)
  | 'prompt'       // Shell prompt (usually hidden)

export type BlockStatus =
  | 'pending'      // Command submitted, not started
  | 'running'      // Command executing
  | 'completed'    // Command finished successfully
  | 'failed'       // Command failed (non-zero exit)
  | 'interrupted'  // Command interrupted (Ctrl+C)

// Core block structure
export interface TerminalBlock {
  id: string                    // Unique block ID
  tabId: string                 // Terminal tab this belongs to
  type: BlockType
  status: BlockStatus

  // Content
  content: string               // Raw text content
  ansiContent?: string          // ANSI-formatted content (for colors)

  // Command metadata
  command?: string              // The actual command (for command blocks)
  workingDir: string            // CWD when command ran
  exitCode?: number             // Exit code (0 = success)

  // Timing
  startTime: number             // When command started (ms)
  endTime?: number              // When command finished (ms)
  duration?: number             // Duration in ms

  // Shell integration data
  promptText?: string           // The prompt that was shown
  shellPid?: number             // Process ID

  // UI state
  collapsed: boolean            // Is output collapsed?
  selected: boolean             // Is block selected?

  // Relationships
  parentBlockId?: string        // For nested blocks (subshells)

  createdAt: number
  updatedAt: number
}

// Block collection per terminal
export interface TerminalBlockList {
  terminalId: string
  blocks: TerminalBlock[]
  activeBlockId?: string        // Currently executing block
  lastExitCode: number          // Last command exit code
}

// OSC 133 sequence types (FinalTerm protocol)
export enum OSC133Sequence {
  PROMPT_START = 'A',           // Start of prompt
  PROMPT_END = 'B',             // End of prompt / start of command
  COMMAND_START = 'C',          // Command execution started
  COMMAND_END = 'D',            // Command finished
}

// Parser state for tracking sequences
export interface ParserState {
  currentSequence?: OSC133Sequence
  currentBlock?: TerminalBlock
  promptBuffer: string
  commandBuffer: string
  outputBuffer: string
  lastSequenceTime: number
}
