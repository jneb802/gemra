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

  /**
   * Spawn a new PTY instance
   */
  spawn(id: string, options: PtyOptions): { pid: number } {
    // Determine shell
    const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh')

    // Determine working directory
    const cwd = options.cwd || process.env.HOME || os.homedir()

    // Spawn PTY
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd,
      env: { ...process.env, ...options.env } as Record<string, string>,
    })

    // Store instance
    this.terminals.set(id, {
      id,
      pty: ptyProcess,
      pid: ptyProcess.pid,
    })

    // Handle data from PTY
    ptyProcess.onData((data) => {
      this.emit('data', { terminalId: id, data })
    })

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      this.emit('exit', { terminalId: id, exitCode, signal })
      this.terminals.delete(id)
    })

    return { pid: ptyProcess.pid }
  }

  /**
   * Write data to a PTY
   */
  write(id: string, data: string): boolean {
    const terminal = this.getTerminal(id)
    if (!terminal) return false

    terminal.pty.write(data)
    return true
  }

  /**
   * Resize a PTY
   */
  resize(id: string, cols: number, rows: number): boolean {
    const terminal = this.getTerminal(id)
    if (!terminal) return false

    terminal.pty.resize(cols, rows)
    return true
  }

  /**
   * Kill a PTY
   */
  kill(id: string): boolean {
    const terminal = this.getTerminal(id)
    if (!terminal) return false

    terminal.pty.kill()
    this.terminals.delete(id)
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
    for (const [id, terminal] of this.terminals) {
      try {
        terminal.pty.kill()
      } catch (error) {
        console.error(`Failed to kill PTY ${id}:`, error)
      }
    }
    this.terminals.clear()
    this.removeAllListeners() // Remove all event listeners
  }
}
