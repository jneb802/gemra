import { useCallback } from 'react'
import type { TerminalBlock } from '../../../shared/types/blocks'
import { stripAnsi } from '../../utils/ansiToReact'

interface UseBlockAIOptions {
  onSendToChat: (message: string) => void
  workingDir: string
}

/**
 * Hook for AI-powered block operations
 */
export function useBlockAI({ onSendToChat, workingDir }: UseBlockAIOptions) {
  /**
   * Explain an error from a failed block
   */
  const explainError = useCallback((block: TerminalBlock) => {
    if (!block.command) return

    const command = block.command
    const output = stripAnsi(block.content || '')
    const exitCode = block.exitCode || 1

    // Construct prompt for Claude
    const prompt = `I ran this command in my terminal and got an error:

\`\`\`bash
${command}
\`\`\`

**Exit code:** ${exitCode}

**Output:**
\`\`\`
${output.slice(0, 2000)}${output.length > 2000 ? '\n...(truncated)' : ''}
\`\`\`

**Working directory:** \`${workingDir}\`

Can you explain what went wrong and how to fix it?`

    onSendToChat(prompt)
  }, [onSendToChat, workingDir])

  /**
   * Send block output to chat as context
   */
  const sendToChat = useCallback((block: TerminalBlock, customPrompt?: string) => {
    const command = block.command || 'Command'
    const output = stripAnsi(block.content || '')

    const prompt = customPrompt || `Here's the output from running \`${command}\`:\n\n\`\`\`\n${output.slice(0, 3000)}${output.length > 3000 ? '\n...(truncated)' : ''}\n\`\`\`\n\nWhat does this tell us?`

    onSendToChat(prompt)
  }, [onSendToChat])

  /**
   * Get AI command suggestion based on natural language
   */
  const suggestCommand = useCallback((intent: string) => {
    const prompt = `I want to: ${intent}

Working directory: \`${workingDir}\`

What shell command should I run? Please provide the command and a brief explanation.`

    onSendToChat(prompt)
  }, [onSendToChat, workingDir])

  /**
   * Fix a failed command with AI
   */
  const fixCommand = useCallback((block: TerminalBlock) => {
    if (!block.command) return

    const command = block.command
    const output = stripAnsi(block.content || '')
    const exitCode = block.exitCode || 1

    const prompt = `This command failed:

\`\`\`bash
${command}
\`\`\`

**Error (exit code ${exitCode}):**
\`\`\`
${output.slice(0, 2000)}${output.length > 2000 ? '\n...(truncated)' : ''}
\`\`\`

Please provide a corrected version of the command that should work, and explain what was wrong.`

    onSendToChat(prompt)
  }, [onSendToChat])

  /**
   * Analyze output patterns (for debugging)
   */
  const analyzeOutput = useCallback((block: TerminalBlock) => {
    const output = stripAnsi(block.content || '')

    const prompt = `Analyze this command output:

\`\`\`
${output.slice(0, 3000)}${output.length > 3000 ? '\n...(truncated)' : ''}
\`\`\`

What patterns, errors, or important information can you identify?`

    onSendToChat(prompt)
  }, [onSendToChat])

  return {
    explainError,
    sendToChat,
    suggestCommand,
    fixCommand,
    analyzeOutput,
  }
}
