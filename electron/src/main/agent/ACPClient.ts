import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { app } from 'electron'
import path from 'path'
import { ACPMessage, DockerOptions } from '../../shared/types'
import { DockerManager } from '../docker/DockerManager'
import { Logger } from '../../shared/utils/logger'

export interface ACPClientOptions {
  workingDirectory: string
  customEnv?: Record<string, string>
  dockerOptions?: DockerOptions
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
   * Get the path to claude-code-acp script
   */
  private getClaudeCodePath(): string {
    let appPath = app.getAppPath()

    // In packaged apps, app.getAppPath() returns path to app.asar
    // But node_modules are unpacked to app.asar.unpacked
    // Node.js cannot read from .asar archives, so we must use the unpacked path
    if (app.isPackaged && appPath.endsWith('.asar')) {
      appPath = appPath.replace('.asar', '.asar.unpacked')
    }

    const scriptPath = path.join(
      appPath,
      'node_modules',
      '@zed-industries',
      'claude-code-acp',
      'dist',
      'index.js'
    )
    return scriptPath
  }

  /**
   * Start the claude-code-acp process (with or without Docker)
   */
  async start(): Promise<void> {
    if (this.options.dockerOptions?.enabled) {
      return this.startWithDocker()
    } else {
      return this.startDirect()
    }
  }

  /**
   * Start claude-code-acp directly on host (no Docker)
   */
  private async startDirect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.log('Starting claude-code-acp (direct mode)...')

      // Emit disabled status for non-Docker mode
      this.emit('containerStatus', { status: 'disabled' })

      const claudeCodePath = this.getClaudeCodePath()
      this.logger.log(`Using claude-code-acp from: ${claudeCodePath}`)

      // In packaged apps, spawn with 'node' command (requires node in PATH)
      // In development, use Electron's node
      const command = app.isPackaged ? 'node' : process.execPath
      const args = [claudeCodePath]

      this.logger.log(`Spawning: ${command} ${args.join(' ')}`)

      this.process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...this.options.customEnv,
        },
        cwd: this.options.workingDirectory,
      })

      this.setupProcessHandlers(resolve, reject)
    })
  }

  /**
   * Start claude-code-acp in Docker container
   */
  private async startWithDocker(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      this.logger.log('Starting claude-code-acp (Docker mode)...')

      try {
        const dockerManager = new DockerManager()

        // Check Docker availability
        const dockerCheck = await dockerManager.isDockerAvailable()
        if (!dockerCheck.available) {
          this.logger.error('Docker not available:', dockerCheck.error)
          this.emit('containerStatus', { status: 'error', error: dockerCheck.error })
          // Fallback to direct mode
          this.logger.log('Falling back to direct mode')
          return this.startDirect().then(resolve).catch(reject)
        }

        // Emit building status
        this.emit('containerStatus', { status: 'building' })

        // Build image if needed
        const buildResult = await dockerManager.buildImageIfNeeded(
          this.options.workingDirectory
        )
        if (!buildResult.success) {
          this.logger.error('Failed to build Docker image:', buildResult.error)
          this.emit('containerStatus', { status: 'error', error: buildResult.error })
          // Fallback to direct mode
          this.logger.log('Falling back to direct mode')
          return this.startDirect().then(resolve).catch(reject)
        }

        // Emit starting status
        this.emit('containerStatus', { status: 'starting' })

        const imageName = buildResult.imageName!
        const args = this.buildDockerArgs(imageName)

        this.logger.log('Spawning Docker container:', args)

        this.process = spawn('docker', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
        })

        this.setupProcessHandlers(resolve, reject)
      } catch (error) {
        this.logger.error('Docker startup error:', error)
        reject(error)
      }
    })
  }

  /**
   * Build docker run arguments
   */
  private buildDockerArgs(imageName: string): string[] {
    const homeDir = process.env.HOME || process.env.USERPROFILE

    return [
      'run',
      '-i', // Interactive (keep stdin open)
      '--rm', // Auto-remove container on exit
      '--network',
      'host', // Access host localhost (for LiteLLM)
      '-v',
      `${this.options.workingDirectory}:/workspace`, // Mount working dir
      '-w',
      '/workspace', // Set working directory in container
      '-v',
      `${homeDir}/.gitconfig:/root/.gitconfig:ro`, // Git config (read-only)
      '-v',
      `${homeDir}/.ssh:/root/.ssh:ro`, // SSH keys (read-only)
      ...this.buildEnvArgs(), // Add -e flags for each env var
      imageName,
      'claude-code-acp', // Command to run in container
    ]
  }

  /**
   * Build environment variable arguments for Docker
   */
  private buildEnvArgs(): string[] {
    const envVars = {
      ...this.options.customEnv,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GIT_USER_NAME: process.env.GIT_USER_NAME,
      GIT_USER_EMAIL: process.env.GIT_USER_EMAIL,
    }

    const args: string[] = []
    for (const [key, value] of Object.entries(envVars)) {
      if (value) {
        args.push('-e', `${key}=${value}`)
      }
    }
    return args
  }

  /**
   * Setup process event handlers (shared between direct and Docker modes)
   */
  private setupProcessHandlers(
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    if (!this.process) {
      reject(new Error('Process not initialized'))
      return
    }

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
      this.logger.log(`Process exited with code ${code}, signal ${signal}`)
      this.emit('exit', { code, signal })
    })

    // Handle process errors
    this.process.on('error', (error) => {
      this.logger.error('Process error:', error)
      reject(error)
    })

    // Resolve when process is spawned
    if (this.process.pid) {
      this.logger.log(`Started with PID ${this.process.pid}`)
      // Emit running status (only for Docker mode, direct mode already emitted disabled)
      if (this.options.dockerOptions?.enabled) {
        this.emit('containerStatus', { status: 'running' })
      }
      resolve()
    } else {
      reject(new Error('Failed to start process'))
    }
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

      // Skip lines that don't look like JSON (log messages, etc.)
      if (!line.trim().startsWith('{')) {
        this.logger.log('Skipping non-JSON line:', line)
        continue
      }

      try {
        const message: ACPMessage = JSON.parse(line)
        this.logger.log('Received message:', message)
        this.emit('message', message)
      } catch (error) {
        // Only emit error for lines that looked like JSON but failed to parse
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
            this.logger.log(`Session created: ${sessionId}`)
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
          this.process!.kill('SIGKILL')
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
