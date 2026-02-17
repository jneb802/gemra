import { useEffect, useRef } from 'react'
import type { Terminal } from '@xterm/xterm'
import { useBlockStore } from '../../stores/blockStore'
import type { OSC133Sequence, ParserState } from '../../../shared/types/blocks'

interface UseOSC133ParserOptions {
  terminal: Terminal | null
  terminalId: string
  workingDir: string
  onBlockCreated?: (blockId: string) => void
}

export function useOSC133Parser({
  terminal,
  terminalId,
  workingDir,
  onBlockCreated
}: UseOSC133ParserOptions) {
  const parserState = useRef<ParserState>({
    promptBuffer: '',
    commandBuffer: '',
    outputBuffer: '',
    lastSequenceTime: Date.now(),
  })

  const createBlock = useBlockStore(s => s.createBlock)
  const updateBlock = useBlockStore(s => s.updateBlock)
  const appendToBlock = useBlockStore(s => s.appendToBlock)
  const startBlockExecution = useBlockStore(s => s.startBlockExecution)
  const finishBlockExecution = useBlockStore(s => s.finishBlockExecution)
  const getActiveBlock = useBlockStore(s => s.getActiveBlock)

  useEffect(() => {
    if (!terminal) return

    console.log('[OSC 133] Parser registered for terminal:', terminalId)

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

          // Create a new command block (pending)
          const block = createBlock(terminalId, {
            type: 'command',
            status: 'pending',
            content: '',
            command: '',
            workingDir,
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
            // Update command block with actual command
            updateBlock(terminalId, state.currentBlock.id, {
              command: state.commandBuffer.trim(),
              content: state.commandBuffer.trim(),
            })

            // Start execution
            startBlockExecution(terminalId, state.currentBlock.id)

            // Create output block
            const outputBlock = createBlock(terminalId, {
              type: 'output',
              status: 'running',
              content: '',
              workingDir,
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
      const match = data.match(/^file:\/\/[^\/]*(.*)$/)
      if (match) {
        const newWorkingDir = match[1]
        console.log('[OSC 7] Working directory:', newWorkingDir)

        // Update current block's working dir
        const activeBlock = getActiveBlock(terminalId)
        if (activeBlock) {
          updateBlock(terminalId, activeBlock.id, {
            workingDir: newWorkingDir,
          })
        }
      }
      return true
    })

    // Capture terminal output to detect command input
    // Note: We need to intercept data BEFORE it's written to terminal
    // This is tricky with xterm.js - we'll handle it via the write callback
    const originalWrite = terminal.write.bind(terminal)
    terminal.write = (data: string | Uint8Array, callback?: () => void) => {
      const state = parserState.current

      // Convert to string if needed
      const strData = typeof data === 'string' ? data : new TextDecoder().decode(data)

      // Accumulate data based on current sequence
      switch (state.currentSequence) {
        case 'A':
          // Accumulating prompt
          state.promptBuffer += strData
          break

        case 'B':
          // Accumulating command input
          state.commandBuffer += strData
          break

        case 'C':
          // Accumulating command output
          state.outputBuffer += strData
          if (state.currentBlock) {
            appendToBlock(terminalId, state.currentBlock.id, strData)
          }
          break
      }

      // Call original write
      return originalWrite(data, callback)
    }

    return () => {
      disposeOscHandler.dispose()
      disposeOsc7Handler.dispose()

      // Restore original write
      // Note: This is a bit hacky, in production we'd use a proper wrapper
      // terminal.write = originalWrite
    }
  }, [terminal, terminalId, workingDir])

  return {
    parserState: parserState.current,
  }
}
