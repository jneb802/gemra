import { EventEmitter } from 'events'
import { ACPClient } from './ACPClient'
import { ACPMessage, DockerOptions, MessageContent } from '../../shared/types'
import { getProfile } from '../../shared/profiles'
import { Logger } from '../../shared/utils/logger'

export interface ClaudeAgentOptions {
  workingDirectory: string
  profileId?: string
  model?: string
  dockerOptions?: DockerOptions
}

/**
 * ClaudeAgent - High-level wrapper for a single Claude Code agent
 */
export class ClaudeAgent extends EventEmitter {
  private client: ACPClient
  private status: 'idle' | 'working' | 'error' = 'idle'
  private logger: Logger
  private activeToolCalls: Map<string, { id: string; name: string; input: any; startTime: number }> = new Map()

  constructor(public id: string, options: ClaudeAgentOptions) {
    super()

    this.logger = new Logger(`ClaudeAgent ${id}`)

    const profile = getProfile(options.profileId || 'anthropic')
    this.logger.log(`Using profile: ${profile.name}`)

    if (options.dockerOptions?.enabled) {
      console.log(`[ClaudeAgent ${id}] Docker mode enabled`)
    }

    this.client = new ACPClient({
      workingDirectory: options.workingDirectory,
      model: options.model,
      customEnv: profile.env,
      dockerOptions: options.dockerOptions,
    })

    // Forward client events
    this.client.on('message', (message: ACPMessage) => {
      this.handleMessage(message)
    })

    this.client.on('error', (error: Error) => {
      this.status = 'error'
      this.emit('error', error)
    })

    this.client.on('exit', (info: { code: number | null; signal: string | null }) => {
      this.status = 'idle'
      this.emit('exit', info)
    })

    this.client.on('toolExecution', (toolInfo: any) => {
      this.handleToolExecution(toolInfo)
    })

    this.client.on('agentStatus', (status: any) => {
      this.emit('agentStatus', status)
    })

    this.client.on('containerStatus', (data: any) => {
      this.emit('containerStatus', data)
    })

    this.client.on('questPrompt', (data: any) => {
      this.emit('questPrompt', data)
    })
  }

  private handleToolExecution(toolInfo: any): void {
    const toolId = toolInfo.id || `tool-${Date.now()}`
    const toolName = toolInfo.name || 'unknown'
    const toolInput = toolInfo.input || {}

    if (!this.activeToolCalls.has(toolId)) {
      const startTime = Date.now()
      this.activeToolCalls.set(toolId, { id: toolId, name: toolName, input: toolInput, startTime })

      this.emit('tool-started', {
        id: toolId,
        name: toolName,
        input: toolInput,
        status: 'running',
        startTime,
      })

      this.logger.log(`Tool started: ${toolName} (${toolId})`)
    }

    this.emit('toolExecution', toolInfo)
  }

  private completeAllActiveTools(): void {
    const now = Date.now()

    for (const [toolId, toolData] of this.activeToolCalls.entries()) {
      const duration = now - toolData.startTime
      this.emit('tool-completed', {
        id: toolId,
        name: toolData.name,
        input: toolData.input,
        status: 'completed',
        startTime: toolData.startTime,
        endTime: now,
        duration,
        output: undefined,
      })
      this.logger.log(`Tool completed: ${toolData.name} (${toolId}) - ${duration}ms`)
    }

    this.activeToolCalls.clear()
  }

  async start(): Promise<void> {
    this.logger.log('Starting...')
    await this.client.start()
    this.status = 'idle'
    this.emit('started')
  }

  async sendPrompt(content: string | MessageContent[]): Promise<void> {
    this.logger.log('Sending content:', typeof content === 'string' ? content : `[${content.length} blocks]`)
    this.status = 'working'
    this.emit('status', 'working')

    try {
      await this.client.sendPrompt(content)
    } catch (error: any) {
      this.status = 'error'
      this.emit('error', error)
      throw error
    }
  }

  private handleMessage(message: ACPMessage): void {
    this.logger.log('Handling message:', JSON.stringify(message, null, 2))

    if (message.method === 'session/update') {
      const update = message.params?.update

      if (update?.sessionUpdate === 'agent_message_chunk') {
        const content = update.content
        const blocks = Array.isArray(content) ? content : [content]

        for (const block of blocks) {
          if (block.type === 'text' && block.text) {
            this.emit('text', block.text)
          }
        }
      }
    }

    if (message.result) {
      this.completeAllActiveTools()

      if (message.result.usage) {
        const usage = {
          inputTokens: message.result.usage.input_tokens || 0,
          outputTokens: message.result.usage.output_tokens || 0,
          timestamp: Date.now(),
        }
        this.logger.log('Usage:', usage)
        this.emit('usage', usage)
      }

      this.status = 'idle'
      this.emit('status', 'idle')
      this.emit('promptComplete', { stopReason: message.result.stop_reason ?? null })
    }

    this.emit('message', message)
  }

  async cancelCurrentTurn(): Promise<void> {
    this.logger.log('Cancelling current turn...')
    await this.client.cancelCurrentTurn()
    this.status = 'idle'
    this.emit('status', 'idle')
  }

  async setMode(modeId: string): Promise<void> {
    await this.client.setMode(modeId)
  }

  async setModel(modelId: string): Promise<void> {
    await this.client.setModel(modelId)
  }

  respondToPermission(questId: string, optionId: string): void {
    this.client.respondToPermission(questId, optionId)
  }

  async stop(): Promise<void> {
    this.logger.log('Stopping...')
    await this.client.stop()
  }

  getStatus(): 'idle' | 'working' | 'error' {
    return this.status
  }

  isRunning(): boolean {
    return this.client.isRunning()
  }

  async getSupportedCommands(): Promise<any[]> {
    return this.client.getSupportedCommands()
  }
}
