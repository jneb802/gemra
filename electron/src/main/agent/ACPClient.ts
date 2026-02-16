import { EventEmitter } from 'events'
import { ACPMessage, DockerOptions, MessageContent } from '../../shared/types'
import { Logger } from '../../shared/utils/logger'
import { spawnDockerProcess, checkDockerAvailable } from './DockerSpawner'
import { DockerImageBuilder } from './DockerImageBuilder'
import type { SDKSpawnOptions } from './DockerSpawner'

export interface ACPClientOptions {
  workingDirectory: string
  customEnv?: Record<string, string>
  dockerOptions?: DockerOptions
}

/**
 * ACP Client - Uses Claude Agent SDK directly (no subprocess)
 */
export class ACPClient extends EventEmitter {
  private session: any // Will be SDKSession from the SDK
  private sessionId?: string
  private logger = new Logger('ACPClient')
  private isActive = false
  private currentPhase: 'idle' | 'thinking' | 'streaming' | 'tool_execution' = 'idle'

  constructor(private options: ACPClientOptions) {
    super()
  }

  /**
   * Start the Claude Agent SDK session
   */
  async start(): Promise<void> {
    this.logger.log('Starting Claude Agent SDK session...')

    // Handle Docker mode
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
      // Dynamic import of ES module SDK
      const sdk = await import('@anthropic-ai/claude-agent-sdk')
      const { app } = await import('electron')
      const path = await import('path')

      // Get path to SDK CLI executable
      let appPath = app.getAppPath()
      if (app.isPackaged && appPath.endsWith('.asar')) {
        appPath = appPath.replace('.asar', '.asar.unpacked')
      }
      const cliPath = path.join(
        appPath,
        'node_modules',
        '@anthropic-ai',
        'claude-agent-sdk',
        'cli.js'
      )

      this.logger.log(`Using SDK CLI from: ${cliPath}`)

      // Create a new session
      this.session = sdk.unstable_v2_createSession({
        model: 'claude-sonnet-4-5-20250929', // Use Sonnet 4.5 (correct format)
        pathToClaudeCodeExecutable: cliPath,
        executable: 'node', // Will use system node (must be in PATH)
        workingDirectory: this.options.workingDirectory, // Set working directory
        env: {
          ...process.env,
          ...this.options.customEnv,
          // Add common node paths to PATH for Finder launches
          PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin',
        },
      })

      this.isActive = true
      this.logger.log('Session created successfully (direct mode)')
    } catch (error) {
      this.logger.error('Failed to start SDK session:', error)
      throw error
    }
  }

  /**
   * Start session in Docker mode
   */
  private async startWithDocker(): Promise<void> {
    try {
      this.logger.log('Starting in Docker mode...')

      // Check if Docker is available
      const dockerCheck = await checkDockerAvailable()
      if (!dockerCheck.available) {
        this.logger.error('Docker not available:', dockerCheck.error)
        this.emit('containerStatus', { status: 'error', error: dockerCheck.error })
        throw new Error(dockerCheck.error)
      }

      // Ensure Docker image exists
      const imageName = this.options.dockerOptions?.imageName || 'gemra-claude:latest'
      const builder = new DockerImageBuilder()

      // Check if image exists
      const imageExists = await builder.imageExists(imageName)

      if (!imageExists) {
        this.logger.log(`Docker image ${imageName} not found, building...`)
        this.emit('containerStatus', { status: 'building' })

        // Forward build progress
        builder.on('progress', (output) => {
          this.logger.log('[Docker Build]', output.trim())
        })

        // Build the image
        const { app } = await import('electron')
        const path = await import('path')

        // Get project root (working directory should be project root)
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

      // Dynamic import of ES module SDK
      const sdk = await import('@anthropic-ai/claude-agent-sdk')
      const { app } = await import('electron')
      const path = await import('path')

      // Get path to SDK CLI executable
      let appPath = app.getAppPath()
      if (app.isPackaged && appPath.endsWith('.asar')) {
        appPath = appPath.replace('.asar', '.asar.unpacked')
      }
      const cliPath = path.join(
        appPath,
        'node_modules',
        '@anthropic-ai',
        'claude-agent-sdk',
        'cli.js'
      )

      this.logger.log(`Using SDK CLI from: ${cliPath}`)
      this.emit('containerStatus', { status: 'starting' })

      // Create session with custom Docker spawn
      this.session = sdk.unstable_v2_createSession({
        model: 'claude-sonnet-4-5-20250929',
        pathToClaudeCodeExecutable: cliPath,
        executable: 'node',
        workingDirectory: this.options.workingDirectory,
        env: {
          ...process.env,
          ...this.options.customEnv,
          PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin',
        },

        // Custom spawn function to use Docker
        spawnClaudeCodeProcess: (options: SDKSpawnOptions) => {
          this.logger.log('Spawning Claude CLI in Docker container...')

          try {
            const dockerProcess = spawnDockerProcess(options, {
              imageName,
              workingDir: this.options.workingDirectory,
              cliPath,
              env: this.options.customEnv,
            })

            // Track container lifecycle
            dockerProcess.on('spawn', () => {
              this.logger.log('Docker container spawned successfully')
              this.emit('containerStatus', { status: 'running' })
            })

            dockerProcess.on('error', (error) => {
              this.logger.error('Docker container error:', error)
              this.emit('containerStatus', {
                status: 'error',
                error: error.message,
              })
            })

            dockerProcess.on('exit', (code, signal) => {
              this.logger.log(`Docker container exited (code: ${code}, signal: ${signal})`)
              // Don't emit disabled here - let the session close handler do it
            })

            return dockerProcess
          } catch (error) {
            this.logger.error('Failed to spawn Docker container:', error)
            this.emit('containerStatus', {
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
            })
            throw error
          }
        },
      })

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
   * Handle SDK messages and convert to ACP format
   */
  private handleSDKMessage(sdkMessage: any): void {
    this.logger.log('SDK message type:', sdkMessage.type)

    if (sdkMessage.type === 'assistant') {
      // Assistant message with content
      const message = sdkMessage.message
      if (message && message.content) {
        // Transition to streaming phase on first text
        if (this.currentPhase !== 'streaming') {
          this.currentPhase = 'streaming'
          this.emit('agentStatus', { type: 'streaming' })
        }

        // Extract text from content blocks
        for (const block of message.content) {
          if (block.type === 'text' && block.text) {
            const acpMessage: ACPMessage = {
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                update: {
                  sessionUpdate: 'agent_message_chunk',
                  content: { type: 'text', text: block.text },
                },
              },
            }
            this.emit('message', acpMessage)
          } else if (block.type === 'tool_use') {
            // Tool execution within message
            this.currentPhase = 'tool_execution'
            this.emit('toolExecution', {
              id: block.id,
              name: block.name,
              input: block.input,
              status: 'running',
            })
            this.emit('agentStatus', {
              type: 'tool_execution',
              tool: {
                id: block.id,
                name: block.name,
                input: block.input,
                status: 'running',
              },
            })
          }
        }
      }
    } else if (sdkMessage.type === 'result') {
      // Final result with usage stats
      const acpMessage: ACPMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          usage: sdkMessage.usage,
        },
      }
      this.emit('message', acpMessage)

      // Transition to idle
      this.currentPhase = 'idle'
      this.emit('agentStatus', { type: 'idle' })

      // Check for errors
      if (sdkMessage.is_error || sdkMessage.error) {
        this.emit('error', new Error(sdkMessage.result || sdkMessage.error || 'Unknown error'))
      }
    } else if (sdkMessage.type === 'system') {
      // System initialization - store session ID
      if (sdkMessage.session_id && !this.sessionId) {
        this.sessionId = sdkMessage.session_id
        this.logger.log('Session ID from SDK:', this.sessionId)
      }
    } else if (sdkMessage.type === 'tool_use' || sdkMessage.type === 'tool_execution') {
      // Tool execution
      this.currentPhase = 'tool_execution'
      const toolInfo = {
        id: sdkMessage.id || sdkMessage.tool?.id || 'unknown',
        name: sdkMessage.name || sdkMessage.tool?.name || 'unknown',
        input: sdkMessage.input || sdkMessage.tool?.input || {},
        status: 'running' as const,
      }
      this.emit('toolExecution', toolInfo)
      this.emit('agentStatus', { type: 'tool_execution', tool: toolInfo })
      this.logger.log('Tool use:', toolInfo.name)
    }
  }

  /**
   * Create a new session (compatibility method)
   */
  async createSession(): Promise<string> {
    // Generate our own session ID for tracking
    // SDK's sessionId is only available after first message
    if (!this.sessionId) {
      this.sessionId = `session-${Date.now()}`
      this.logger.log(`Session ID: ${this.sessionId}`)
    }
    return this.sessionId
  }

  /**
   * Send a prompt to the agent (supports text or multimodal content)
   */
  async sendPrompt(content: string | MessageContent[]): Promise<void> {
    if (!this.session) {
      throw new Error('Session not started')
    }

    this.logger.log('Sending content:', typeof content === 'string' ? content : `[${content.length} blocks]`)

    // Transition to thinking phase when sending
    this.currentPhase = 'thinking'
    this.emit('agentStatus', { type: 'thinking' })

    try {
      // Send the content (SDK supports both string and content blocks)
      await this.session.send(content)

      // Stream the response
      for await (const message of this.session.stream()) {
        this.handleSDKMessage(message)
      }

      this.logger.log('Message stream completed for this turn')
    } catch (error) {
      this.logger.error('Error during prompt/streaming:', error)
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    if (!this.session) return

    this.logger.log('Stopping session...')
    this.isActive = false

    try {
      this.session.close()
      this.logger.log('Session closed')
    } catch (error) {
      this.logger.error('Error closing session:', error)
    }
  }

  /**
   * Get process ID (not applicable for SDK)
   */
  getPid(): number | undefined {
    return undefined
  }

  /**
   * Check if session is running
   */
  isRunning(): boolean {
    return this.isActive && !!this.session
  }

  /**
   * Get supported slash commands from SDK
   */
  async getSupportedCommands(): Promise<any[]> {
    if (!this.session) {
      throw new Error('Session not started')
    }

    // Check if supportedCommands method exists (SDK may not support it yet)
    if (typeof this.session.supportedCommands !== 'function') {
      this.logger.log('SDK does not support supportedCommands() method')
      return []
    }

    try {
      const commands = await this.session.supportedCommands()
      this.logger.log('Supported commands:', commands)
      return commands
    } catch (error) {
      this.logger.error('Failed to get supported commands:', error)
      return []
    }
  }
}
