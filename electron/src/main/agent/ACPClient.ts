import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { ACPMessage } from '../../shared/types'

export interface ACPClientOptions {
  workingDirectory: string
}

/**
 * ACP Client - Handles JSON-RPC communication with claude-code-acp over stdio
 */
export class ACPClient extends EventEmitter {
  private process?: ChildProcess
  private messageBuffer = ''
  private requestId = 0

  constructor(private options: ACPClientOptions) {
    super()
  }

  /**
   * Start the claude-code-acp process
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('[ACPClient] Starting claude-code-acp...')

      this.process = spawn('claude-code-acp', [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
        cwd: this.options.workingDirectory,
      })

      // Handle stdout (NDJSON messages from agent)
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleStdout(data)
      })

      // Handle stderr (errors and logs)
      this.process.stderr?.on('data', (data: Buffer) => {
        const message = data.toString()
        console.error('[ACPClient] stderr:', message)
        this.emit('error', new Error(message))
      })

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        console.log(`[ACPClient] Process exited with code ${code}, signal ${signal}`)
        this.emit('exit', { code, signal })
      })

      // Handle process errors
      this.process.on('error', (error) => {
        console.error('[ACPClient] Process error:', error)
        reject(error)
      })

      // Resolve when process is spawned
      if (this.process.pid) {
        console.log(`[ACPClient] Started with PID ${this.process.pid}`)
        resolve()
      } else {
        reject(new Error('Failed to start process'))
      }
    })
  }

  /**
   * Handle stdout data - parse NDJSON messages
   */
  private handleStdout(data: Buffer): void {
    this.messageBuffer += data.toString()

    // Split by newlines
    const lines = this.messageBuffer.split('\n')

    // Keep the last incomplete line in buffer
    this.messageBuffer = lines.pop() || ''

    // Process each complete line
    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const message: ACPMessage = JSON.parse(line)
        console.log('[ACPClient] Received message:', message)
        this.emit('message', message)
      } catch (error) {
        console.error('[ACPClient] Failed to parse message:', line, error)
        this.emit('error', new Error(`Failed to parse ACP message: ${line}`))
      }
    }
  }

  /**
   * Send a prompt to the agent
   */
  sendPrompt(prompt: string): void {
    if (!this.process || !this.process.stdin) {
      throw new Error('Agent process not started')
    }

    const id = ++this.requestId
    const message: ACPMessage = {
      jsonrpc: '2.0',
      id,
      method: 'agent/prompt',
      params: {
        prompt,
      },
    }

    console.log('[ACPClient] Sending prompt:', message)
    this.process.stdin.write(JSON.stringify(message) + '\n')
  }

  /**
   * Stop the agent process
   */
  async stop(): Promise<void> {
    if (!this.process) return

    console.log('[ACPClient] Stopping process...')

    return new Promise((resolve) => {
      this.process!.on('exit', () => {
        console.log('[ACPClient] Process stopped')
        resolve()
      })

      this.process!.kill('SIGTERM')

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          console.log('[ACPClient] Force killing process')
          this.process.kill('SIGKILL')
        }
      }, 5000)
    })
  }

  /**
   * Get process ID
   */
  getPid(): number | undefined {
    return this.process?.pid
  }

  /**
   * Check if process is running
   */
  isRunning(): boolean {
    return !!this.process && !this.process.killed
  }
}
