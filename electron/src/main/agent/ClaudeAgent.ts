import { EventEmitter } from 'events'
import { ACPClient } from './ACPClient'
import { ACPMessage } from '../../shared/types'

export interface ClaudeAgentOptions {
  workingDirectory: string
  apiKey: string
}

/**
 * ClaudeAgent - High-level wrapper for a single Claude Code agent
 */
export class ClaudeAgent extends EventEmitter {
  private client: ACPClient
  private status: 'idle' | 'working' | 'error' = 'idle'

  constructor(public id: string, options: ClaudeAgentOptions) {
    super()

    this.client = new ACPClient(options)

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
  sendPrompt(prompt: string): void {
    console.log(`[ClaudeAgent ${this.id}] Sending prompt:`, prompt)
    this.status = 'working'
    this.emit('status', 'working')

    this.client.sendPrompt(prompt)
  }

  /**
   * Handle incoming ACP messages
   */
  private handleMessage(message: ACPMessage): void {
    console.log(`[ClaudeAgent ${this.id}] Handling message:`, message)

    // For MVP, we're looking for text content in the response
    // The actual ACP protocol is more complex, but we'll simplify for now

    // Check if it's a notification with content
    if (message.method === 'agent/update') {
      const content = message.params?.content

      if (content) {
        // Extract text from content blocks
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              this.emit('text', block.text)
            }
          }
        } else if (typeof content === 'string') {
          this.emit('text', content)
        }
      }
    }

    // Check if it's a response with result
    if (message.result) {
      // Agent finished processing
      this.status = 'idle'
      this.emit('status', 'idle')

      // Extract any text from result
      if (typeof message.result === 'string') {
        this.emit('text', message.result)
      } else if (message.result.content) {
        if (typeof message.result.content === 'string') {
          this.emit('text', message.result.content)
        }
      }
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
