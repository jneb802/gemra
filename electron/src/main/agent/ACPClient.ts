import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import { Readable, Writable } from 'stream'
import * as acp from '@agentclientprotocol/sdk'
import { DockerOptions, MessageContent } from '../../shared/types'
import { Logger } from '../../shared/utils/logger'
import { spawnDockerProcess, checkDockerAvailable } from './DockerSpawner'
import { DockerImageBuilder } from './DockerImageBuilder'

export interface ACPClientOptions {
  workingDirectory: string
  model?: string
  customEnv?: Record<string, string>
  dockerOptions?: DockerOptions
}

/**
 * ACP Client - Uses @agentclientprotocol/sdk ClientSideConnection directly
 */
export class ACPClient extends EventEmitter {
  private connection: acp.ClientSideConnection | null = null
  private sessionId: string | null = null
  private proc: ChildProcess | null = null
  private logger = new Logger('ACPClient')
  private isActive = false
  private currentPhase: 'idle' | 'thinking' | 'streaming' | 'tool_execution' = 'idle'

  // Pending permission requests waiting for UI response
  private pendingPermissions = new Map<string, {
    resolve: (response: acp.RequestPermissionResponse) => void
    reject: (err: Error) => void
  }>()

  constructor(private options: ACPClientOptions) {
    super()
  }

  /**
   * Start the ACP session
   */
  async start(): Promise<void> {
    this.logger.log('Starting ACP session...')

    if (this.options.dockerOptions?.enabled) {
      await this.startWithDocker()
    } else {
      this.emit('containerStatus', { status: 'disabled' })
      await this.startDirect()
    }
  }

  /**
   * Start session in direct mode (no Docker)
   */
  private async startDirect(): Promise<void> {
    try {
      const cliPath = await this.getCliPath()
      this.logger.log(`Using SDK CLI from: ${cliPath}`)

      const env = {
        ...process.env,
        ...this.options.customEnv,
        PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin',
      }

      this.proc = spawn('node', [cliPath], {
        cwd: this.options.workingDirectory,
        env: env as Record<string, string>,
        stdio: ['pipe', 'pipe', 'inherit'],
      })

      this.proc.on('error', (err) => {
        this.logger.error('Process error:', err)
        this.emit('error', err)
      })

      this.proc.on('exit', (code, signal) => {
        this.logger.log(`Process exited (code: ${code}, signal: ${signal})`)
        this.isActive = false
        this.emit('exit', { code, signal })
      })

      await this.connectACP()
      this.isActive = true
      this.logger.log('Session created successfully (direct mode)')
    } catch (error) {
      this.logger.error('Failed to start direct session:', error)
      throw error
    }
  }

  /**
   * Start session in Docker mode
   */
  private async startWithDocker(): Promise<void> {
    try {
      this.logger.log('Starting in Docker mode...')

      const dockerCheck = await checkDockerAvailable()
      if (!dockerCheck.available) {
        this.logger.error('Docker not available:', dockerCheck.error)
        this.emit('containerStatus', { status: 'error', error: dockerCheck.error })
        throw new Error(dockerCheck.error)
      }

      const imageName = this.options.dockerOptions?.imageName || 'gemra-claude:latest'
      const builder = new DockerImageBuilder()
      const imageExists = await builder.imageExists(imageName)

      if (!imageExists) {
        this.logger.log(`Docker image ${imageName} not found, building...`)
        this.emit('containerStatus', { status: 'building' })

        builder.on('progress', (output) => {
          this.logger.log('[Docker Build]', output.trim())
        })

        const { app } = await import('electron')
        const path = await import('path')
        const projectRoot = this.options.workingDirectory
        const dockerfilePath = path.join(projectRoot, 'Dockerfile.claude')
        const buildResult = await builder.ensureImage(imageName, dockerfilePath, projectRoot)

        if (!buildResult.success) {
          this.logger.error('Failed to build Docker image:', buildResult.error)
          this.emit('containerStatus', { status: 'error', error: buildResult.error })
          throw new Error(`Docker build failed: ${buildResult.error}`)
        }

        this.logger.log('Docker image built successfully')
      }

      const cliPath = await this.getCliPath()
      this.logger.log(`Using SDK CLI from: ${cliPath}`)
      this.emit('containerStatus', { status: 'starting' })

      const sdkOptions = {
        command: 'node',
        args: [cliPath],
        cwd: this.options.workingDirectory,
        env: {
          ...process.env,
          ...this.options.customEnv,
          PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin',
        } as Record<string, string | undefined>,
        signal: new AbortController().signal,
      }

      this.proc = spawnDockerProcess(sdkOptions, {
        imageName,
        workingDir: this.options.workingDirectory,
        cliPath,
        env: this.options.customEnv,
      })

      this.proc.on('spawn', () => {
        this.logger.log('Docker container spawned successfully')
        this.emit('containerStatus', { status: 'running' })
      })

      this.proc.on('error', (error) => {
        this.logger.error('Docker container error:', error)
        this.emit('containerStatus', { status: 'error', error: error.message })
        this.emit('error', error)
      })

      this.proc.on('exit', (code, signal) => {
        this.logger.log(`Docker container exited (code: ${code}, signal: ${signal})`)
        this.isActive = false
        this.emit('exit', { code, signal })
      })

      await this.connectACP()
      this.isActive = true
      this.logger.log('Session created successfully (Docker mode)')
    } catch (error) {
      this.logger.error('Failed to start Docker session:', error)
      this.emit('containerStatus', {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Get path to the Claude Code CLI executable
   */
  private async getCliPath(): Promise<string> {
    const { app } = await import('electron')
    const path = await import('path')

    let appPath = app.getAppPath()
    if (app.isPackaged && appPath.endsWith('.asar')) {
      appPath = appPath.replace('.asar', '.asar.unpacked')
    }

    return path.join(appPath, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js')
  }

  /**
   * Establish ACP connection over the spawned process stdio
   */
  private async connectACP(): Promise<void> {
    if (!this.proc || !this.proc.stdin || !this.proc.stdout) {
      throw new Error('Process not started or stdio not available')
    }

    // Convert Node.js streams to Web streams
    const webWritable = Writable.toWeb(this.proc.stdin) as WritableStream<Uint8Array>
    const webReadable = Readable.toWeb(this.proc.stdout) as ReadableStream<Uint8Array>

    // ndJsonStream(output: WritableStream, input: ReadableStream)
    const stream = acp.ndJsonStream(webWritable, webReadable)

    this.connection = new acp.ClientSideConnection(
      (_agent) => this.buildClient(),
      stream
    )

    // Initialize
    await this.connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: 'Gemra', version: '1.0.0' },
    })

    // Create session
    const result = await this.connection.newSession({
      cwd: this.options.workingDirectory,
      mcpServers: [],
    })
    this.sessionId = result.sessionId
    this.logger.log('Session ID:', this.sessionId)

    // Apply initial model if specified
    if (this.options.model && this.connection.setSessionConfigOption) {
      try {
        await this.connection.setSessionConfigOption({
          sessionId: this.sessionId,
          configId: 'model',
          value: this.options.model,
        })
        this.logger.log('Initial model set to:', this.options.model)
      } catch (err) {
        this.logger.error('Failed to set initial model (non-fatal):', err)
      }
    }
  }

  /**
   * Build the ACP Client implementation (callbacks for server-sent events)
   */
  private buildClient(): acp.Client {
    return {
      sessionUpdate: async (params: acp.SessionNotification): Promise<void> => {
        const update = params.update

        switch (update.sessionUpdate) {
          case 'agent_message_chunk': {
            const block = update.content
            if (block.type === 'text') {
              this.emit('text', (block as acp.TextContent).text)
            }
            if (this.currentPhase !== 'streaming') {
              this.currentPhase = 'streaming'
              this.emit('agentStatus', { type: 'streaming' })
            }
            break
          }

          case 'tool_call': {
            this.currentPhase = 'tool_execution'
            const toolCall = update as acp.ToolCall & { sessionUpdate: 'tool_call' }
            this.emit('toolExecution', {
              id: toolCall.toolCallId,
              name: toolCall.title,
              input: toolCall.rawInput ?? {},
              status: 'running',
            })
            this.emit('agentStatus', {
              type: 'tool_execution',
              tool: {
                id: toolCall.toolCallId,
                name: toolCall.title,
                input: toolCall.rawInput ?? {},
                status: 'running',
              },
            })
            break
          }

          case 'tool_call_update': {
            const toolUpdate = update as acp.ToolCallUpdate & { sessionUpdate: 'tool_call_update' }
            if (toolUpdate.status === 'completed' || toolUpdate.status === 'failed') {
              this.emit('toolCompleted', {
                id: toolUpdate.toolCallId,
                status: toolUpdate.status,
                output: toolUpdate.rawOutput,
              })
            }
            break
          }

          case 'usage_update':
            // UsageUpdate contains context window stats (size/used), not token counts.
            // Token usage (inputTokens/outputTokens) is reported via PromptResponse.
            break

          default:
            break
        }
      },

      requestPermission: async (params: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> => {
        return new Promise((resolve, reject) => {
          const permId = crypto.randomUUID()
          this.pendingPermissions.set(permId, { resolve, reject })

          this.emit('questPrompt', {
            questId: permId,
            prompt: {
              id: permId,
              question: params.toolCall.title ?? 'Permission required',
              header: 'Permission',
              answerType: 'select',
              options: params.options.map((o) => ({
                label: o.name,
                value: o.optionId,
                optionId: o.optionId,
                description: o.kind,
              })),
              multiSelect: false,
            },
          })
        })
      },
    }
  }

  /**
   * Create a session (compatibility shim — session is created in connectACP)
   */
  async createSession(): Promise<string> {
    if (!this.sessionId) {
      this.sessionId = `session-${Date.now()}`
    }
    return this.sessionId
  }

  /**
   * Send a prompt to the agent
   */
  async sendPrompt(content: string | MessageContent[]): Promise<void> {
    if (!this.connection || !this.sessionId) {
      throw new Error('Session not started')
    }

    this.logger.log('Sending content:', typeof content === 'string' ? content : `[${content.length} blocks]`)

    this.currentPhase = 'thinking'
    this.emit('agentStatus', { type: 'thinking' })

    // Convert content to ACP ContentBlock array
    const prompt: acp.ContentBlock[] = typeof content === 'string'
      ? [{ type: 'text', text: content }]
      : content.flatMap((block): acp.ContentBlock[] => {
          if (block.type === 'text') {
            return [{ type: 'text', text: block.text }]
          }
          if (block.type === 'image') {
            return [{
              type: 'image',
              data: block.source.data,
              mimeType: block.source.media_type as acp.ImageContent['mimeType'],
            }]
          }
          return []
        })

    try {
      const response = await this.connection.prompt({
        sessionId: this.sessionId,
        prompt,
      })

      this.logger.log('Prompt completed, stopReason:', response.stopReason)

      // Emit token usage if available
      if (response.usage) {
        this.emit('usage', {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          timestamp: Date.now(),
        })
      }

      // Transition to idle
      this.currentPhase = 'idle'
      this.emit('agentStatus', { type: 'idle' })

      // Signal turn complete (for usage/status tracking in ClaudeAgent)
      this.emit('promptComplete', { stopReason: response.stopReason })
    } catch (error) {
      this.logger.error('Error during prompt:', error)
      this.currentPhase = 'idle'
      this.emit('agentStatus', { type: 'idle' })
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Cancel the current turn
   */
  async cancelCurrentTurn(): Promise<void> {
    if (!this.connection || !this.sessionId) return

    this.logger.log('Cancelling current turn...')
    try {
      await this.connection.cancel({ sessionId: this.sessionId })
    } catch (error) {
      this.logger.error('Error cancelling turn:', error)
    }
  }

  /**
   * Set the session mode
   */
  async setMode(modeId: string): Promise<void> {
    if (!this.connection || !this.sessionId) return

    this.logger.log('Setting mode to:', modeId)
    try {
      if (this.connection.setSessionConfigOption) {
        await this.connection.setSessionConfigOption({
          sessionId: this.sessionId,
          configId: 'mode',
          value: modeId,
        })
      }
    } catch (error) {
      this.logger.error('Error setting mode (non-fatal):', error)
    }
  }

  /**
   * Set the session model
   */
  async setModel(modelId: string): Promise<void> {
    if (!this.connection || !this.sessionId) return

    this.logger.log('Setting model to:', modelId)
    try {
      if (this.connection.setSessionConfigOption) {
        await this.connection.setSessionConfigOption({
          sessionId: this.sessionId,
          configId: 'model',
          value: modelId,
        })
      }
    } catch (error) {
      this.logger.error('Error setting model (non-fatal):', error)
    }
  }

  /**
   * Respond to a pending permission request
   */
  respondToPermission(questId: string, optionId: string): void {
    const pending = this.pendingPermissions.get(questId)
    if (!pending) {
      this.logger.error('No pending permission for questId:', questId)
      return
    }

    this.pendingPermissions.delete(questId)
    pending.resolve({
      outcome: { outcome: 'selected', optionId },
    })
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    this.logger.log('Stopping session...')
    this.isActive = false

    // Reject all pending permissions
    for (const [, pending] of this.pendingPermissions) {
      pending.reject(new Error('Session stopped'))
    }
    this.pendingPermissions.clear()

    if (this.proc) {
      try {
        this.proc.kill()
      } catch (error) {
        this.logger.error('Error killing process:', error)
      }
      this.proc = null
    }

    this.connection = null
  }

  /**
   * Get process ID
   */
  getPid(): number | undefined {
    return this.proc?.pid
  }

  /**
   * Check if session is running
   */
  isRunning(): boolean {
    return this.isActive && !!this.connection
  }

  /**
   * Get supported slash commands (not available via ACP; return empty)
   */
  async getSupportedCommands(): Promise<any[]> {
    return []
  }
}
