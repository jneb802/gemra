import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { ACPMessage } from '../../shared/types'
import { Logger } from '../../shared/utils/logger'

export interface ACPClientOptions {
  workingDirectory: string
  customEnv?: Record<string, string>
}

/**
 * ACP Client - Handles JSON-RPC communication with claude-code-acp over stdio
 */
export class ACPClient extends EventEmitter {
  private process?: ChildProcess
  private messageBuffer = ''
  private requestId = 0
  private sessionId?: string
  private logger = new Logger('ACPClient')

  constructor(private options: ACPClientOptions) {
    super()
  }

  /**
   * Start the claude-code-acp process
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.log('Starting claude-code-acp...')

      this.process = spawn('claude-code-acp', [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...this.options.customEnv,
        },
        cwd: this.options.workingDirectory,
      })

      // Handle stdout (NDJSON messages from agent)
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleStdout(data)
      })

      // Handle stderr (errors and logs)
      this.process.stderr?.on('data', (data: Buffer) => {
        const message = data.toString()

        // Filter out Node.js warnings (ExperimentalWarning, DeprecationWarning, etc.)
        if (message.includes('Warning:') || message.includes('(Use `node --trace-warnings')) {
          this.logger.log('warning:', message.trim())
          return
        }

        // Only emit actual errors
        this.logger.error('stderr:', message)
        this.emit('error', new Error(message))
      })

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        console.log(`[ACPClient] Process exited with code ${code}, signal ${signal}`)
        this.emit('exit', { code, signal })
      })

      // Handle process errors
      this.process.on('error', (error) => {
        this.logger.error('Process error:', error)
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
        this.logger.log('Received message:', message)
        this.emit('message', message)
      } catch (error) {
        this.logger.error('Failed to parse message:', line, error)
        this.emit('error', new Error(`Failed to parse ACP message: ${line}`))
      }
    }
  }

  /**
   * Create a new session
   */
  async createSession(): Promise<string> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Agent process not started')
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId
      const message = {
        jsonrpc: '2.0',
        id,
        method: 'session/new',
        params: {
          cwd: this.options.workingDirectory,
          mcpServers: [],
        },
      }

      // Listen for the response
      const handler = (response: ACPMessage) => {
        if (response.id === id) {
          this.off('message', handler)
          if (response.result && response.result.sessionId) {
            const sessionId = response.result.sessionId
            this.sessionId = sessionId
            console.log(`[ACPClient] Session created: ${sessionId}`)
            resolve(sessionId)
          } else if (response.error) {
            reject(new Error(`Session creation failed: ${response.error.message}`))
          } else {
            reject(new Error('Invalid session/new response'))
          }
        }
      }

      this.on('message', handler)

      this.logger.log('Creating session:', message)
      this.process!.stdin!.write(JSON.stringify(message) + '\n')

      // Timeout after 10 seconds
      setTimeout(() => {
        this.off('message', handler)
        reject(new Error('Session creation timeout'))
      }, 10000)
    })
  }

  /**
   * Send a prompt to the agent
   */
  async sendPrompt(prompt: string): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Agent process not started')
    }

    // Create session if not exists
    if (!this.sessionId) {
      await this.createSession()
    }

    const id = ++this.requestId
    const message: ACPMessage = {
      jsonrpc: '2.0',
      id,
      method: 'session/prompt',
      params: {
        sessionId: this.sessionId,
        prompt: [
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    }

    this.logger.log('Sending prompt:', message)
    this.process.stdin.write(JSON.stringify(message) + '\n')
  }

  /**
   * Stop the agent process
   */
  async stop(): Promise<void> {
    if (!this.process) return

    this.logger.log('Stopping process...')

    return new Promise((resolve) => {
      this.process!.on('exit', () => {
        this.logger.log('Process stopped')
        resolve()
      })

      this.process!.kill('SIGTERM')

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.logger.log('Force killing process')
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
