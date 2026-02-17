import * as pty from 'node-pty'
import { EventEmitter } from 'events'
import * as os from 'os'
import * as path from 'path'
import type { PtyOptions } from '@shared/types'

interface PtyInstance {
  id: string
  pty: pty.IPty
  pid: number
}

export class PtyManager extends EventEmitter {
  private terminals = new Map<string, PtyInstance>()
  private lastActivity = new Map<string, number>()
  private readonly MAX_IDLE_TIME = 30 * 60 * 1000 // 30 minutes
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    super()
    // Start periodic cleanup of orphaned terminals
    // unref() allows Node.js to exit even if this interval is still pending
    this.cleanupInterval = setInterval(() => {
      this.cleanupOrphanedTerminals()
    }, 5 * 60 * 1000) // Check every 5 minutes
    this.cleanupInterval.unref()
  }

  /**
   * Cleanup orphaned or idle terminals
   */
  private cleanupOrphanedTerminals(): void {
    const now = Date.now()
    for (const [id, lastActive] of this.lastActivity) {
      if (now - lastActive > this.MAX_IDLE_TIME) {
        console.log(`Cleaning up orphaned terminal ${id} (idle for ${Math.round((now - lastActive) / 60000)} minutes)`)
        this.kill(id)
      }
    }
  }

  /**
   * Get a terminal instance by ID
   */
  private getTerminal(id: string): PtyInstance | null {
    const terminal = this.terminals.get(id)
    if (!terminal) {
      console.error(`Terminal ${id} not found`)
      return null
    }
    return terminal
  }

  private touchActivity(id: string): void {
    this.lastActivity.set(id, Date.now())
  }

  /**
   * Spawn a new PTY instance
   */
  spawn(id: string, options: PtyOptions): { pid: number } {
    if (this.terminals.has(id)) {
      throw new Error(`Terminal ${id} already exists`)
    }

    // Determine shell
    const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/sh')

    // Determine working directory
    const cwd = options.cwd || process.env.HOME || os.homedir()

    // Spawn PTY with Gemra environment variable for shell integration
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd,
      env: {
        ...process.env,
        ...options.env,
        GEMRA_TERMINAL: '1',  // Enable shell integration
      } as Record<string, string>,
    })

    // Store instance
    this.terminals.set(id, {
      id,
      pty: ptyProcess,
      pid: ptyProcess.pid,
    })

    // Initialize last activity timestamp
    this.lastActivity.set(id, Date.now())

    // Handle data from PTY
    ptyProcess.onData((data) => {
      this.lastActivity.set(id, Date.now()) // Update activity on data
      this.emit('data', { terminalId: id, data })
    })

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      this.emit('exit', { terminalId: id, exitCode, signal })
      this.terminals.delete(id)
      this.lastActivity.delete(id)
    })

    return { pid: ptyProcess.pid }
  }

  /**
   * Write data to a PTY
   */
  write(id: string, data: string): boolean {
    const terminal = this.getTerminal(id)
    if (!terminal) return false

    this.touchActivity(id)
    terminal.pty.write(data)
    return true
  }

  /**
   * Resize a PTY
   */
  resize(id: string, cols: number, rows: number): boolean {
    const terminal = this.getTerminal(id)
    if (!terminal) return false

    this.touchActivity(id)
    terminal.pty.resize(cols, rows)
    return true
  }

  /**
   * Kill a PTY
   */
  kill(id: string): boolean {
    const terminal = this.terminals.get(id) // Don't use getTerminal to avoid updating activity
    if (!terminal) return false

    terminal.pty.kill()
    this.terminals.delete(id)
    this.lastActivity.delete(id)
    return true
  }

  /**
   * Get all terminal IDs
   */
  list(): string[] {
    return Array.from(this.terminals.keys())
  }

  /**
   * Kill all PTYs (cleanup)
   */
  killAll(): void {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    for (const [id, terminal] of this.terminals) {
      try {
        terminal.pty.kill()
      } catch (error) {
        console.error(`Failed to kill PTY ${id}:`, error)
      }
    }
    this.terminals.clear()
    this.lastActivity.clear()
    this.removeAllListeners() // Remove all event listeners
  }
}
