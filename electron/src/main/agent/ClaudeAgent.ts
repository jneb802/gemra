import { EventEmitter } from 'events'
import { ACPClient } from './ACPClient'
import { DockerOptions, MessageContent } from '../../shared/types'
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

    this.client.on('text', (text: string) => {
      this.emit('text', text)
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

    this.client.on('toolCompleted', (toolInfo: any) => {
      this.handleToolCompleted(toolInfo)
    })

    this.client.on('agentStatus', (status: any) => {
      this.emit('agentStatus', status)
    })

    this.client.on('usage', (usage: any) => {
      this.emit('usage', usage)
    })

    this.client.on('containerStatus', (data: any) => {
      this.emit('containerStatus', data)
    })

    this.client.on('questPrompt', (data: any) => {
      this.emit('questPrompt', data)
    })

    this.client.on('promptComplete', (data: any) => {
      this.status = 'idle'
      this.emit('status', 'idle')
      this.emit('promptComplete', data)
    })
  }

  /**
   * Handle tool execution tracking
   */
  private handleToolExecution(toolInfo: any): void {
    const toolId = toolInfo.id || `tool-${Date.now()}`
    const toolName = toolInfo.name || 'unknown'
    const toolInput = toolInfo.input || {}

    if (!this.activeToolCalls.has(toolId)) {
      const startTime = Date.now()
      this.activeToolCalls.set(toolId, {
        id: toolId,
        name: toolName,
        input: toolInput,
        startTime,
      })

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

  /**
   * Handle individual tool completion from ACP tool_call_update events
   */
  private handleToolCompleted(toolInfo: any): void {
    const toolId = toolInfo.id
    const toolData = this.activeToolCalls.get(toolId)
    const now = Date.now()

    if (toolData) {
      const duration = now - toolData.startTime

      this.emit('tool-completed', {
        id: toolId,
        name: toolData.name,
        input: toolData.input,
        status: toolInfo.status === 'failed' ? 'error' : 'completed',
        startTime: toolData.startTime,
        endTime: now,
        duration,
        output: toolInfo.output,
      })

      this.activeToolCalls.delete(toolId)
      this.logger.log(`Tool completed: ${toolData.name} (${toolId}) - ${duration}ms`)
    }
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    this.logger.log('Starting...')
    await this.client.start()
    this.status = 'idle'
    this.emit('started')
  }

  /**
   * Send a prompt to the agent (supports text or multimodal content)
   */
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

  /**
   * Cancel the current turn
   */
  async cancelCurrentTurn(): Promise<void> {
    this.logger.log('Cancelling current turn...')
    await this.client.cancelCurrentTurn()
    this.status = 'idle'
    this.emit('status', 'idle')
  }

  /**
   * Set the session mode
   */
  async setMode(modeId: string): Promise<void> {
    await this.client.setMode(modeId)
  }

  /**
   * Set the session model
   */
  async setModel(modelId: string): Promise<void> {
    await this.client.setModel(modelId)
  }

  /**
   * Respond to a permission/quest prompt
   */
  respondToPermission(questId: string, optionId: string): void {
    this.client.respondToPermission(questId, optionId)
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    this.logger.log('Stopping...')
    await this.client.stop()
  }

  /**
   * Get agent status
   */
  getStatus(): 'idle' | 'working' | 'error' {
    return this.status
  }

  /**
   * Check if agent is running
   */
  isRunning(): boolean {
    return this.client.isRunning()
  }

  /**
   * Get supported slash commands
   */
  async getSupportedCommands(): Promise<any[]> {
    return this.client.getSupportedCommands()
  }
}
