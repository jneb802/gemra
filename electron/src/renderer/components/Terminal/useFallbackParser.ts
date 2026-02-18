import { useEffect, useRef, useCallback } from 'react'
import type { Terminal } from '@xterm/xterm'
import { useBlockStore } from '../../stores/blockStore'

interface UseFallbackParserOptions {
  terminal: Terminal | null
  terminalId: string
  workingDir: string
  enabled: boolean
}

/**
 * Fallback parser for terminals without shell integration.
 *
 * Uses heuristics to detect command boundaries:
 * - Watches terminal.onData (keyboard input) to capture command text and detect Enter
 * - Intercepts terminal.write (PTY output) to detect prompt patterns and accumulate output
 */
export function useFallbackParser({
  terminal,
  terminalId,
  workingDir,
  enabled,
}: UseFallbackParserOptions) {
  const createBlock = useBlockStore(s => s.createBlock)
  const updateBlock = useBlockStore(s => s.updateBlock)
  const appendToBlock = useBlockStore(s => s.appendToBlock)
  const finishBlockExecution = useBlockStore(s => s.finishBlockExecution)

  const currentCommandRef = useRef<string>('')
  const commandBlockIdRef = useRef<string | undefined>(undefined)
  const outputBlockIdRef = useRef<string | undefined>(undefined)
  const outputAccumRef = useRef<string>('')
  const lineBufferRef = useRef<string>('')

  const detectPrompt = useCallback((line: string): boolean => {
    const patterns = [
      /^\$ /,                           // Bash/zsh: "$ "
      /^% /,                            // Zsh: "% "
      /^> /,                            // PowerShell: "> "
      /^[^@]+@[^:]+:[^$%>]*[$%>] /,    // user@host:path$ or similar
      /^\w+:[^$%>]*[$%>] /,             // simplified path:$
    ]
    return patterns.some(pattern => pattern.test(line.trim()))
  }, [])

  useEffect(() => {
    if (!terminal || !enabled) return

    console.log('[FallbackParser] Enabled for terminal:', terminalId)

    // ── Keyboard input listener ──────────────────────────────────────────────
    // terminal.onData fires for user keystrokes only (not PTY output).
    // Use it to capture command text and detect Enter.
    const inputDisposable = terminal.onData((data: string) => {
      // Enter key → submit command
      if (data === '\r' || data === '\n') {
        const command = currentCommandRef.current.trim()
        currentCommandRef.current = ''

        if (command) {
          const commandBlock = createBlock(terminalId, {
            type: 'command',
            status: 'pending',
            command,
            content: command,
            workingDir,
          })
          commandBlockIdRef.current = commandBlock.id

          const outputBlock = createBlock(terminalId, {
            type: 'output',
            status: 'running',
            content: '',
            workingDir,
            parentBlockId: commandBlock.id,
          })
          outputBlockIdRef.current = outputBlock.id
          outputAccumRef.current = ''
          lineBufferRef.current = ''

          console.log('[FallbackParser] Command executed:', command)
        }
        return
      }

      // Backspace — remove last char from accumulated command
      if (data === '\x7f') {
        currentCommandRef.current = currentCommandRef.current.slice(0, -1)
        return
      }

      // Accumulate printable command input (only when not waiting for output)
      if (!outputBlockIdRef.current && data.length === 1 && data >= ' ') {
        currentCommandRef.current += data
      }
    })

    // ── PTY output intercept ─────────────────────────────────────────────────
    // terminal.write is called with data arriving from the PTY process.
    // Intercept it to detect prompt patterns and feed output blocks.
    const originalWrite = terminal.write.bind(terminal)
    terminal.write = (data: string | Uint8Array, callback?: () => void) => {
      if (outputBlockIdRef.current) {
        const strData = typeof data === 'string' ? data : new TextDecoder().decode(data)

        // Strip ANSI/OSC escape sequences for prompt detection and clean storage
        const stripped = strData
          .replace(/\x1b\[[^@-~]*[@-~]/g, '')   // CSI sequences
          .replace(/\x1b\][^\x07]*\x07/g, '')    // OSC sequences (BEL-terminated)
          .replace(/\x1b\][^\x1b]*\x1b\\/g, '')  // OSC sequences (ST-terminated)

        outputAccumRef.current += stripped
        lineBufferRef.current += stripped

        // Scan the last line of accumulated output for a prompt pattern
        const lines = lineBufferRef.current.split('\n')
        const lastLine = lines[lines.length - 1] ?? ''

        if (detectPrompt(lastLine)) {
          // Prompt detected → command finished. Remove the trailing prompt line from output.
          const outputLines = outputAccumRef.current.split('\n')
          outputLines.pop()
          const cleanOutput = outputLines.join('\n')

          if (commandBlockIdRef.current) {
            finishBlockExecution(terminalId, commandBlockIdRef.current, 0)
          }

          updateBlock(terminalId, outputBlockIdRef.current, { content: cleanOutput })
          finishBlockExecution(terminalId, outputBlockIdRef.current, 0)

          commandBlockIdRef.current = undefined
          outputBlockIdRef.current = undefined
          outputAccumRef.current = ''
          lineBufferRef.current = ''

          console.log('[FallbackParser] Command completed (heuristic)')
        } else {
          appendToBlock(terminalId, outputBlockIdRef.current, stripped)
        }
      }

      return originalWrite(data, callback)
    }

    return () => {
      inputDisposable.dispose()
      terminal.write = originalWrite
    }
  }, [terminal, terminalId, workingDir, enabled, createBlock, updateBlock, appendToBlock, finishBlockExecution, detectPrompt])

  return {
    isActive: enabled,
  }
}
