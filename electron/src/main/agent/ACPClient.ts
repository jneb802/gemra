// test comment for /commit command
import { EventEmitter } from 'events'
import { ACPMessage, DockerOptions, MessageContent } from '../../shared/types'
import { Logger } from '../../shared/utils/logger'
import { spawnDockerProcess, checkDockerAvailable } from './DockerSpawner'
import { DockerImageBuilder } from './DockerImageBuilder'
import type { SDKSpawnOptions } from './DockerSpawner'

export interface ACPClientOptions {
  workingDirectory: string
  model?: string
  customEnv?: Record<string, string>
  dockerOptions?: DockerOptions
}

/**
 * ACP Client - Uses @anthropic-ai/claude-agent-sdk directly (no ACP subprocess)
 */
export class ACPClient extends EventEmitter {
  private session: any // SDKSession from @anthropic-ai/claude-agent-sdk
  private sessionId?: string
  private logger = new Logger('ACPClient')
  private isActive = false
  private currentPhase: 'idle' | 'thinking' | 'streaming' | 'tool_execution' = 'idle'
  private lastStreamedText = ''
  private cancelled = false

  // Pending quest responses waiting for user input
  private pendingQuests = new Map<string, (response: string) => void>()

  constructor(private options: ACPClientOptions) {
    super()
  }

  async start(): Promise<void> {
    this.logger.log('Starting Claude Agent SDK session...')

    if (this.options.dockerOptions?.enabled) {
      await this.startWithDocker()
    } else {
      this.emit('containerStatus', { status: 'disabled' })
      await this.startDirect()
    }
  }

  private async startDirect(): Promise<void> {
    try {
      const sdk = await import('@anthropic-ai/claude-agent-sdk')
      const cliPath = await this.getCliPath()
      this.logger.log(`Using SDK CLI from: ${cliPath}`)

      // SDKSessionOptions (unstable_v2_createSession) does not expose cwd or
      // spawnClaudeCodeProcess.  Use query() with a persistent input stream
      // instead — it accepts the full Options type which includes both.
      this.session = this.buildQuerySession(sdk, {
        model: this.options.model || 'claude-sonnet-4-5-20250929',
        pathToClaudeCodeExecutable: cliPath,
        executable: 'node',
        cwd: this.options.workingDirectory,
        env: {
          ...process.env,
          ...this.options.customEnv,
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
   * Build a session-compatible object backed by query() instead of
   * unstable_v2_createSession().  query() accepts the full Options type
   * (including cwd and spawnClaudeCodeProcess) which SDKSessionOptions omits.
   *
   * Internally mirrors what V9 (unstable_v2_createSession) does: an async
   * input queue drives a persistent query, and stream() pauses at each result.
   */
  private buildQuerySession(sdk: any, queryOptions: any): any {
    const inputQueue: any[] = []
    const waiters: Array<() => void> = []
    let closed = false
    let sessionId: string | null = null

    async function* makeInputStream() {
      while (!closed) {
        if (inputQueue.length > 0) {
          yield inputQueue.shift()
        } else {
          await new Promise<void>(resolve => {
            waiters.push(resolve)
          })
        }
      }
    }

    const queryObj = sdk.query({ prompt: makeInputStream(), options: queryOptions })
    const iterator = queryObj[Symbol.asyncIterator]()

    async function* streamGenerator() {
      while (true) {
        const { value, done } = await iterator.next()
        if (done) return
        if (value?.type === 'system' && value?.subtype === 'init') {
          sessionId = value.session_id
        }
        yield value
        if (value?.type === 'result') return // stop; resume on next stream() call
      }
    }

    return {
      get sessionId(): string {
        if (sessionId === null) throw new Error('Session ID not yet available')
        return sessionId
      },
      async send(message: string | any): Promise<void> {
        if (closed) throw new Error('Cannot send to closed session')
        const userMsg =
          typeof message === 'string'
            ? {
                type: 'user',
                session_id: '',
                message: { role: 'user', content: [{ type: 'text', text: message }] },
                parent_tool_use_id: null,
              }
            : Array.isArray(message)
              ? {
                  type: 'user',
                  session_id: '',
                  message: { role: 'user', content: message },
                  parent_tool_use_id: null,
                }
              : message
        inputQueue.push(userMsg)
        if (waiters.length > 0) waiters.shift()!()
      },
      stream: streamGenerator,
      close(): void {
        if (closed) return
        closed = true
        while (waiters.length > 0) waiters.shift()!()
        try {
          queryObj.close?.()
        } catch {
          /* ignore */
        }
      },
    }
  }

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

        const projectRoot = this.options.workingDirectory
        const path = await import('path')
        const dockerfilePath = path.join(projectRoot, 'Dockerfile.claude')
        const buildResult = await builder.ensureImage(imageName, dockerfilePath, projectRoot)

        if (!buildResult.success) {
          this.logger.error('Failed to build Docker image:', buildResult.error)
          this.emit('containerStatus', { status: 'error', error: buildResult.error })
          throw new Error(`Docker build failed: ${buildResult.error}`)
        }

        this.logger.log('Docker image built successfully')
      }

      const sdk = await import('@anthropic-ai/claude-agent-sdk')
      const cliPath = await this.getCliPath()
      this.logger.log(`Using SDK CLI from: ${cliPath}`)
      this.emit('containerStatus', { status: 'starting' })

      this.session = this.buildQuerySession(sdk, {
        model: this.options.model || 'claude-sonnet-4-5-20250929',
        pathToClaudeCodeExecutable: cliPath,
        executable: 'node',
        env: {
          ...process.env,
          ...this.options.customEnv,
          PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin',
        },
        spawnClaudeCodeProcess: (options: SDKSpawnOptions) => {
          this.logger.log('Spawning Claude CLI in Docker container...')

          try {
            const dockerProcess = spawnDockerProcess(options, {
              imageName,
              workingDir: this.options.workingDirectory,
              cliPath,
              env: this.options.customEnv,
            })

            dockerProcess.on('spawn', () => {
              this.logger.log('Docker container spawned successfully')
              this.emit('containerStatus', { status: 'running' })
            })

            dockerProcess.on('error', (error) => {
              this.logger.error('Docker container error:', error)
              this.emit('containerStatus', { status: 'error', error: error.message })
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

  private async getCliPath(): Promise<string> {
    const { app } = await import('electron')
    const path = await import('path')

    let appPath = app.getAppPath()
    if (app.isPackaged && appPath.endsWith('.asar')) {
      appPath = appPath.replace('.asar', '.asar.unpacked')
    }
    return path.join(appPath, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js')
  }

  private handleSDKMessage(sdkMessage: any): void {
    this.logger.log('SDK message type:', sdkMessage.type)

    if (sdkMessage.type === 'assistant') {
      const message = sdkMessage.message
      if (message?.content) {
        if (this.currentPhase !== 'streaming') {
          this.currentPhase = 'streaming'
          this.emit('agentStatus', { type: 'streaming' })
        }

        // Accumulate all text in this message and emit the delta
        let currentAccumulatedText = ''
        for (const block of message.content) {
          if (block.type === 'text' && block.text) {
            currentAccumulatedText += block.text
          }
        }

        if (currentAccumulatedText) {
          const delta = currentAccumulatedText.slice(this.lastStreamedText.length)
          if (delta) {
            const acpMessage: ACPMessage = {
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                update: {
                  sessionUpdate: 'agent_message_chunk',
                  content: { type: 'text', text: delta },
                },
              },
            }
            this.emit('message', acpMessage)
            this.lastStreamedText = currentAccumulatedText
          }
        }

        // Handle tool_use blocks
        for (const block of message.content) {
          if (block.type === 'tool_use') {
            if (block.name === 'AskUserQuestion') {
              this.logger.log('AskUserQuestion tool detected:', block.id)
              const questions = block.input?.questions || []
              if (questions.length > 0) {
                const question = questions[0]
                this.emit('questPrompt', {
                  questId: block.id,
                  prompt: {
                    id: block.id,
                    question: question.question,
                    header: question.header,
                    answerType: 'select',
                    options: question.options || [],
                    multiSelect: question.multiSelect || false,
                  },
                })
                continue
              }
            }

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
      const acpMessage: ACPMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          usage: sdkMessage.usage,
        },
      }
      this.emit('message', acpMessage)

      this.lastStreamedText = ''
      this.currentPhase = 'idle'
      this.emit('agentStatus', { type: 'idle' })

      if (sdkMessage.is_error || sdkMessage.error) {
        this.emit('error', new Error(sdkMessage.result || sdkMessage.error || 'Unknown error'))
      }
    } else if (sdkMessage.type === 'system') {
      if (sdkMessage.session_id && !this.sessionId) {
        this.sessionId = sdkMessage.session_id
        this.logger.log('Session ID from SDK:', this.sessionId)
      }
    }
  }

  async createSession(): Promise<string> {
    if (!this.sessionId) {
      this.sessionId = `session-${Date.now()}`
    }
    return this.sessionId
  }

  async sendPrompt(content: string | MessageContent[]): Promise<void> {
    if (!this.session) {
      throw new Error('Session not started')
    }

    this.logger.log('Sending content:', typeof content === 'string' ? content : `[${content.length} blocks]`)

    this.cancelled = false
    this.lastStreamedText = ''
    this.currentPhase = 'thinking'
    this.emit('agentStatus', { type: 'thinking' })

    try {
      await this.session.send(content)

      for await (const message of this.session.stream()) {
        if (this.cancelled) break
        this.handleSDKMessage(message)
      }

      this.logger.log('Message stream completed for this turn')
    } catch (error) {
      this.logger.error('Error during prompt/streaming:', error)
      this.currentPhase = 'idle'
      this.emit('agentStatus', { type: 'idle' })
      this.emit('error', error)
      throw error
    }
  }

  async cancelCurrentTurn(): Promise<void> {
    this.logger.log('Cancelling current turn...')
    this.cancelled = true
    // Close the underlying session so the stream terminates
    if (this.session) {
      try {
        this.session.close()
      } catch {
        // Ignore errors during cancel
      }
      this.session = null
      this.isActive = false
    }
    this.currentPhase = 'idle'
    this.emit('agentStatus', { type: 'idle' })
  }

  // setMode and setModel are not supported by the SDK session API;
  // the renderer stores these values and they take effect on next session start.
  async setMode(_modeId: string): Promise<void> {}
  async setModel(_modelId: string): Promise<void> {}

  respondToPermission(questId: string, optionId: string): void {
    // Quest responses are sent as regular user messages
    this.logger.log('Responding to quest:', questId, 'with:', optionId)
    if (this.session && this.isActive) {
      this.session.send(optionId).catch((err: any) => {
        this.logger.error('Failed to send quest response:', err)
      })
    }
  }

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

  getPid(): number | undefined {
    return undefined
  }

  isRunning(): boolean {
    return this.isActive && !!this.session
  }

  async getSupportedCommands(): Promise<any[]> {
    if (!this.session || typeof this.session.supportedCommands !== 'function') {
      return []
    }
    try {
      return await this.session.supportedCommands()
    } catch {
      return []
    }
  }
}
