import type { Terminal } from '@xterm/xterm'

/**
 * Global registry of live xterm.js Terminal instances, keyed by terminalId.
 * Allows non-component code (e.g. useCommandSystem) to write directly to a
 * terminal's display without going through the shell's stdin.
 */
const registry = new Map<string, Terminal>()

export const terminalRegistry = {
  register(id: string, terminal: Terminal): void {
    registry.set(id, terminal)
  },

  unregister(id: string): void {
    registry.delete(id)
  },

  /**
   * Write text directly to a terminal's display.
   * Converts \n to \r\n for correct terminal line endings.
   */
  write(id: string, text: string): boolean {
    const terminal = registry.get(id)
    if (!terminal) return false
    terminal.write(text.replace(/\n/g, '\r\n'))
    return true
  },
}
