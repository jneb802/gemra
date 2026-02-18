import React, { useEffect, useRef } from 'react'
import type { Terminal } from '@xterm/xterm'
import { useBlockStore } from '../../stores/blockStore'
import type { OSC133Sequence, ParserState } from '../../../shared/types/blocks'

interface UseOSC133ParserOptions {
  terminal: Terminal | null
  terminalId: string
  workingDir: string
  pendingCommandRef?: React.MutableRefObject<string>
  onBlockCreated?: (blockId: string) => void
  onWorkingDirChange?: (dir: string) => void
}

export function useOSC133Parser({
  terminal,
  terminalId,
  workingDir,
  pendingCommandRef,
  onBlockCreated,
  onWorkingDirChange,
}: UseOSC133ParserOptions) {
  const parserState = useRef<ParserState>({
    promptBuffer: '',
    commandBuffer: '',
    outputBuffer: '',
    lastSequenceTime: Date.now(),
  })

  // Keep workingDir current without causing the effect to re-run and re-wrap terminal.write
  const workingDirRef = useRef(workingDir)
  useEffect(() => {
    workingDirRef.current = workingDir
  }, [workingDir])

  // Pending output buffer for rAF-batched appendToBlock calls
  const pendingOutputRef = useRef<Map<string, string>>(new Map())
  const rafIdRef = useRef<number | null>(null)

  const createBlock = useBlockStore(s => s.createBlock)
  const updateBlock = useBlockStore(s => s.updateBlock)
  const appendToBlock = useBlockStore(s => s.appendToBlock)
  const startBlockExecution = useBlockStore(s => s.startBlockExecution)
  const finishBlockExecution = useBlockStore(s => s.finishBlockExecution)
  const getActiveBlock = useBlockStore(s => s.getActiveBlock)

  // Effect only re-runs when the terminal instance or terminalId changes, not on workingDir changes.
  // workingDir is read via workingDirRef.current inside callbacks.
  useEffect(() => {
    if (!terminal) return

    console.log('[OSC 133] Parser registered for terminal:', terminalId)

    // Flush buffered output to the store in a single update per animation frame
    const flushPendingOutput = () => {
      rafIdRef.current = null
      for (const [blockId, content] of pendingOutputRef.current) {
        if (content) appendToBlock(terminalId, blockId, content)
      }
      pendingOutputRef.current.clear()
    }

    const scheduleFlush = () => {
      if (rafIdRef.current !== null) return
      rafIdRef.current = requestAnimationFrame(flushPendingOutput)
    }

    // Register OSC 133 handler
    const disposeOscHandler = terminal.parser.registerOscHandler(133, (data: string) => {
      console.log('[OSC 133] Received:', data)

      const parts = data.split(';')
      const sequence = parts[0] as OSC133Sequence
      const args = parts.slice(1)

      const state = parserState.current

      switch (sequence) {
        case 'A': {
          // Prompt start
          state.currentSequence = sequence
          state.promptBuffer = ''
          console.log('[Block] Prompt start')
          break
        }

        case 'B': {
          // Prompt end / Command input start
          state.currentSequence = sequence
          console.log('[Block] Prompt end, command start')

          // Consume pending command from TerminalInput (set before pty.write)
          const pendingCmd = pendingCommandRef?.current ?? ''
          if (pendingCommandRef) pendingCommandRef.current = ''

          // Create a new command block (pending)
          const block = createBlock(terminalId, {
            type: 'command',
            status: 'pending',
            content: pendingCmd,
            command: pendingCmd,
            workingDir: workingDirRef.current,
            promptText: state.promptBuffer,
          })

          state.currentBlock = block
          state.commandBuffer = ''
          onBlockCreated?.(block.id)
          break
        }

        case 'C': {
          // Command execution start
          state.currentSequence = sequence
          console.log('[Block] Command execution start')

          if (state.currentBlock) {
            // Only update command from commandBuffer if it's non-empty
            // (it's empty when B and C are sent back-to-back without echo in between)
            const cmdFromBuffer = state.commandBuffer.trim()
            if (cmdFromBuffer) {
              updateBlock(terminalId, state.currentBlock.id, {
                command: cmdFromBuffer,
                content: cmdFromBuffer,
              })
            }

            // Start execution
            startBlockExecution(terminalId, state.currentBlock.id)

            // Create output block
            const outputBlock = createBlock(terminalId, {
              type: 'output',
              status: 'running',
              content: '',
              workingDir: workingDirRef.current,
              parentBlockId: state.currentBlock.id,
            })

            state.currentBlock = outputBlock
            state.outputBuffer = ''
          }
          break
        }

        case 'D': {
          // Command end (with exit code)
          const exitCode = args[0] ? parseInt(args[0], 10) : 0
          console.log('[Block] Command end, exit code:', exitCode)

          // Flush any pending output before marking done
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current)
            flushPendingOutput()
          }

          if (state.currentBlock) {
            // Finish the output block
            finishBlockExecution(terminalId, state.currentBlock.id, exitCode)

            // Also update the parent command block
            if (state.currentBlock.parentBlockId) {
              finishBlockExecution(terminalId, state.currentBlock.parentBlockId, exitCode)
            }
          }

          state.currentSequence = undefined
          state.currentBlock = undefined
          state.commandBuffer = ''
          state.outputBuffer = ''
          break
        }
      }

      state.lastSequenceTime = Date.now()
      return true // Handled
    })

    // Register OSC 7 handler (working directory updates)
    const disposeOsc7Handler = terminal.parser.registerOscHandler(7, (data: string) => {
      // Format: file://hostname/path
      const match = data.match(/^file:\/\/[^/]*(.*)$/)
      if (match) {
        const newWorkingDir = match[1]
        console.log('[OSC 7] Working directory:', newWorkingDir)

        // Propagate to parent so future blocks and git polling use the new dir
        workingDirRef.current = newWorkingDir
        onWorkingDirChange?.(newWorkingDir)

        // Also update the active block's working dir if one is running
        const activeBlock = getActiveBlock(terminalId)
        if (activeBlock) {
          updateBlock(terminalId, activeBlock.id, {
            workingDir: newWorkingDir,
          })
        }
      }
      return true
    })

    // Helper function to strip escape sequences from data
    const stripEscapeSequences = (str: string, mode: 'command' | 'output' = 'output'): string => {
      // Remove OSC sequences: ESC ] ... (BEL | ST)
      let cleaned = str.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      // Remove malformed OSC sequences
      cleaned = cleaned.replace(/\]133;[A-D](?:;[0-9]+)?\s*/g, '')

      if (mode === 'command') {
        // For command input, only strip cursor movement and control sequences
        // but preserve the actual text content more carefully
        cleaned = cleaned.replace(/\x1b\[[0-9;]*[ABCDEFGHJK]/g, '') // Cursor movement, erase
        cleaned = cleaned.replace(/\x1b\[[\d;?]*[hl]/g, '') // Mode setting
        cleaned = cleaned.replace(/\r/g, '') // Carriage returns
      } else {
        // For output, strip ALL CSI sequences (cursor, clear, colors, etc.)
        cleaned = cleaned.replace(/\x1b\[[\d;?]*[A-Za-z]/g, '')
      }

      return cleaned
    }

    // Intercept terminal.write to observe data flowing into the terminal.
    // Installed once per terminal instance (not per workingDir change) to avoid stacking.
    const originalWrite = terminal.write.bind(terminal)
    terminal.write = (data: string | Uint8Array, callback?: () => void) => {
      const state = parserState.current

      // Convert to string if needed
      const strData = typeof data === 'string' ? data : new TextDecoder().decode(data)

      // Accumulate data based on current sequence
      switch (state.currentSequence) {
        case 'A':
          // Accumulating prompt (strip escape sequences for command mode)
          state.promptBuffer += stripEscapeSequences(strData, 'command')
          break

        case 'B':
          // Accumulating command input (strip escape sequences carefully to preserve text)
          state.commandBuffer += stripEscapeSequences(strData, 'command')
          break

        case 'C': {
          // Accumulating command output — buffer and flush via rAF to avoid per-chunk re-renders
          const cleanedOutput = stripEscapeSequences(strData, 'output')
          state.outputBuffer += cleanedOutput
          if (state.currentBlock && cleanedOutput) {
            const blockId = state.currentBlock.id
            pendingOutputRef.current.set(
              blockId,
              (pendingOutputRef.current.get(blockId) ?? '') + cleanedOutput
            )
            scheduleFlush()
          }
          break
        }
      }

      // Call original write
      return originalWrite(data, callback)
    }

    return () => {
      // Cancel any pending flush
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      pendingOutputRef.current.clear()
      disposeOscHandler.dispose()
      disposeOsc7Handler.dispose()
      terminal.write = originalWrite
    }
  }, [terminal, terminalId]) // workingDir intentionally omitted — read via workingDirRef

  return {
    parserState: parserState.current,
  }
}
