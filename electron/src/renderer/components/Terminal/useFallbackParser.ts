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
 * Fallback parser for terminals without shell integration
 *
 * Uses heuristics to detect command boundaries:
 * - Looks for common prompt patterns ($ % >)
 * - Detects command input by watching for Enter key
 * - Groups output until next prompt
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
  const getActiveBlock = useBlockStore(s => s.getActiveBlock)

  const currentCommandRef = useRef<string>('')
  const currentOutputRef = useRef<string>('')
  const commandBlockIdRef = useRef<string>()
  const outputBlockIdRef = useRef<string>()
  const lineBufferRef = useRef<string>('')

  const detectPrompt = useCallback((line: string): boolean => {
    // Common prompt patterns
    const patterns = [
      /^\$ /,                    // Bash/zsh: "$ "
      /^% /,                     // Zsh: "% "
      /^> /,                     // PowerShell: "> "
      /^[^@]+@[^:]+:[^$%>]*[$%>] /, // user@host:path$ or similar
      /^\w+:[^$%>]*[$%>] /,      // simplified path:$
    ]

    return patterns.some(pattern => pattern.test(line.trim()))
  }, [])

  useEffect(() => {
    if (!terminal || !enabled) return

    console.log('[FallbackParser] Enabled for terminal:', terminalId)

    // Monitor terminal data
    const disposable = terminal.onData((data: string) => {
      // Handle Enter key - marks end of command input
      if (data === '\r' || data === '\n') {
        const command = currentCommandRef.current.trim()

        if (command) {
          // Create command block
          const commandBlock = createBlock(terminalId, {
            type: 'command',
            status: 'pending',
            command,
            content: command,
            workingDir,
          })

          commandBlockIdRef.current = commandBlock.id
          currentCommandRef.current = ''

          // Create output block
          const outputBlock = createBlock(terminalId, {
            type: 'output',
            status: 'running',
            content: '',
            workingDir,
            parentBlockId: commandBlock.id,
          })

          outputBlockIdRef.current = outputBlock.id
          currentOutputRef.current = ''

          console.log('[FallbackParser] Command executed:', command)
        }

        return
      }

      // Accumulate command input
      if (!outputBlockIdRef.current) {
        currentCommandRef.current += data
        return
      }

      // Accumulate output
      currentOutputRef.current += data
      lineBufferRef.current += data

      // Check for prompt in buffer (indicates command finished)
      const lines = lineBufferRef.current.split('\n')
      const lastLine = lines[lines.length - 1] || lines[lines.length - 2] || ''

      if (detectPrompt(lastLine)) {
        // Command finished
        if (commandBlockIdRef.current) {
          finishBlockExecution(terminalId, commandBlockIdRef.current, 0)
        }

        if (outputBlockIdRef.current) {
          // Remove the prompt from output
          const outputWithoutPrompt = currentOutputRef.current
            .split('\n')
            .slice(0, -1)
            .join('\n')

          updateBlock(terminalId, outputBlockIdRef.current, {
            content: outputWithoutPrompt,
          })

          finishBlockExecution(terminalId, outputBlockIdRef.current, 0)
        }

        // Reset state
        commandBlockIdRef.current = undefined
        outputBlockIdRef.current = undefined
        currentOutputRef.current = ''
        lineBufferRef.current = ''

        console.log('[FallbackParser] Command completed (heuristic)')
      } else if (outputBlockIdRef.current) {
        // Update output block
        appendToBlock(terminalId, outputBlockIdRef.current, data)
      }
    })

    return () => {
      disposable.dispose()
    }
  }, [terminal, terminalId, workingDir, enabled, createBlock, updateBlock, appendToBlock, finishBlockExecution, detectPrompt])

  return {
    isActive: enabled,
  }
}
