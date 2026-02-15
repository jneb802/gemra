import { EventEmitter } from 'events'
import { ACPClient } from './ACPClient'
import { ACPMessage, DockerOptions } from '../../shared/types'
import { getProfile } from '../../shared/profiles'

export interface ClaudeAgentOptions {
  workingDirectory: string
  profileId?: string
  dockerOptions?: DockerOptions
}

/**
 * ClaudeAgent - High-level wrapper for a single Claude Code agent
 */
export class ClaudeAgent extends EventEmitter {
  private client: ACPClient
  private status: 'idle' | 'working' | 'error' = 'idle'

  constructor(public id: string, options: ClaudeAgentOptions) {
    super()

    // Get profile and merge env vars
    const profile = getProfile(options.profileId || 'anthropic')
    console.log(`[ClaudeAgent ${id}] Using profile: ${profile.name}`)

    if (options.dockerOptions?.enabled) {
      console.log(`[ClaudeAgent ${id}] Docker mode enabled`)
    }

    this.client = new ACPClient({
      workingDirectory: options.workingDirectory,
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
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    console.log(`[ClaudeAgent ${this.id}] Starting...`)
    await this.client.start()
    this.status = 'idle'
    this.emit('started')
  }

  /**
   * Send a prompt to the agent
   */
  async sendPrompt(prompt: string): Promise<void> {
    console.log(`[ClaudeAgent ${this.id}] Sending prompt:`, prompt)
    this.status = 'working'
    this.emit('status', 'working')

    try {
      await this.client.sendPrompt(prompt)
    } catch (error: any) {
      this.status = 'error'
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Handle incoming ACP messages
   */
  private handleMessage(message: ACPMessage): void {
    console.log(`[ClaudeAgent ${this.id}] Handling message:`, JSON.stringify(message, null, 2))

    // Handle session/update messages (agent streaming responses)
    if (message.method === 'session/update') {
      const update = message.params?.update

      console.log(`[ClaudeAgent ${this.id}] Update:`, JSON.stringify(update, null, 2))

      if (update?.sessionUpdate === 'agent_message_chunk') {
        const content = update.content

        console.log(`[ClaudeAgent ${this.id}] Content:`, JSON.stringify(content, null, 2))

        // Handle single content object or array
        const blocks = Array.isArray(content) ? content : [content]

        for (const block of blocks) {
          console.log(`[ClaudeAgent ${this.id}] Block:`, JSON.stringify(block, null, 2))

          if (block.type === 'text' && block.text) {
            console.log(`[ClaudeAgent ${this.id}] Emitting text:`, block.text)
            this.emit('text', block.text)
            this.emit('agentStatus', { type: 'streaming' })
          } else if (block.type === 'tool_use') {
            // Tool execution started
            const toolExecution = {
              id: block.id,
              name: block.name,
              input: block.input,
              status: 'running' as const,
            }
            console.log(`[ClaudeAgent ${this.id}] Tool execution started:`, toolExecution)
            this.emit('agentStatus', { type: 'tool_execution', tool: toolExecution })
            this.emit('toolExecution', toolExecution)
          }
        }
      } else if (update?.sessionUpdate === 'agent_turn_start') {
        // Agent started thinking
        console.log(`[ClaudeAgent ${this.id}] Agent thinking...`)
        this.emit('agentStatus', { type: 'thinking' })
      }
    }

    // Check if it's a response with result (prompt completed)
    if (message.result) {
      // Extract token usage if available
      if (message.result.usage) {
        const usage = {
          inputTokens: message.result.usage.input_tokens || 0,
          outputTokens: message.result.usage.output_tokens || 0,
          timestamp: Date.now(),
        }
        console.log(`[ClaudeAgent ${this.id}] Usage:`, usage)
        this.emit('usage', usage)
      }

      // Agent finished processing
      this.status = 'idle'
      this.emit('status', 'idle')
      this.emit('agentStatus', { type: 'idle' })
    }

    // Forward all messages for debugging
    this.emit('message', message)
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    console.log(`[ClaudeAgent ${this.id}] Stopping...`)
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
}
