import { EventEmitter } from 'events'
import { ACPMessage, DockerOptions } from '../../shared/types'
import { Logger } from '../../shared/utils/logger'

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

  constructor(private options: ACPClientOptions) {
    super()
  }

  /**
   * Start the Claude Agent SDK session
   */
  async start(): Promise<void> {
    if (this.options.dockerOptions?.enabled) {
      // Docker mode not supported with SDK - fall back to direct mode
      this.logger.log('Docker mode not supported with SDK, using direct mode')
      this.emit('containerStatus', { status: 'disabled' })
    } else {
      this.emit('containerStatus', { status: 'disabled' })
    }

    this.logger.log('Starting Claude Agent SDK session...')

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
        env: {
          ...process.env,
          ...this.options.customEnv,
          // Add common node paths to PATH for Finder launches
          PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin',
        },
      })

      this.isActive = true
      this.logger.log('Session created successfully')

      // Start streaming messages in the background
      this.startMessageStream()
    } catch (error) {
      this.logger.error('Failed to start SDK session:', error)
      throw error
    }
  }

  /**
   * Stream messages from the SDK session
   */
  private async startMessageStream(): Promise<void> {
    try {
      for await (const message of this.session.stream()) {
        this.handleSDKMessage(message)
      }
      // Stream ended - agent stopped
      this.logger.log('Message stream ended')
      this.emit('exit', { code: 0, signal: null })
    } catch (error) {
      this.logger.error('Stream error:', error)
      this.emit('error', error)
      this.emit('exit', { code: 1, signal: null })
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
      // Tool execution (for debugging)
      this.logger.log('Tool use:', sdkMessage.tool || sdkMessage.name)
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
   * Send a prompt to the agent
   */
  async sendPrompt(prompt: string): Promise<void> {
    if (!this.session) {
      throw new Error('Session not started')
    }

    this.logger.log('Sending prompt:', prompt)
    await this.session.send(prompt)
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
