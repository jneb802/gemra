import React, { useState, useEffect } from 'react'
import type { TerminalBlock } from '../../../shared/types/blocks'
import { ansiToReact } from '../../utils/ansiToReact'

interface TerminalBlockContentProps {
  block: TerminalBlock
  isGrouped?: boolean
}

/**
 * TerminalBlockContent - Renders a terminal block (command or output)
 *
 * Styled to look similar to chat messages but with terminal-specific indicators
 */
export function TerminalBlockContent({ block, isGrouped = false }: TerminalBlockContentProps) {
  // Command block (user input)
  if (block.type === 'command') {
    return (
      <div className={`terminal-block terminal-block-command ${isGrouped ? 'grouped' : ''}`}>
        <div className="terminal-command-text">
          {block.command || block.content}
        </div>
        {block.status !== 'pending' && block.duration !== undefined && (
          <div className="terminal-block-meta">
            <span className="terminal-duration">{formatDuration(block.duration)}</span>
            {block.exitCode !== undefined && (
              <ExitCodeBadge exitCode={block.exitCode} status={block.status} />
            )}
          </div>
        )}
      </div>
    )
  }

  // Output block (command output)
  if (block.type === 'output') {
    const outputLines = block.content.split('\n').length
    const isLongOutput = outputLines > 20

    // Only show "(no output)" for completed/failed blocks with no content
    const showNoOutput = !block.content && (block.status === 'completed' || block.status === 'failed')

    // Don't render the block at all if it's running and has no content yet
    if (!block.content && block.status === 'running') {
      return null
    }

    return (
      <div className={`terminal-block terminal-block-output ${isGrouped ? 'grouped' : ''} ${block.collapsed ? 'collapsed' : ''}`}>
        {!block.collapsed ? (
          <pre className="terminal-output-text">
            {block.content ? ansiToReact(block.content) : showNoOutput && <span className="terminal-output-empty">(no output)</span>}
          </pre>
        ) : (
          <div className="terminal-output-collapsed">
            <span>Output collapsed ({outputLines} lines) · Click to expand</span>
          </div>
        )}
      </div>
    )
  }

  // LLM block (workflow step awaiting / completed model response)
  if (block.type === 'llm') {
    if (block.status === 'running') {
      return <LlmRunningBlock block={block} />
    }

    const modelShort = block.model?.split('/').pop() ?? 'model'
    return (
      <div className="terminal-block terminal-block-llm">
        <pre className="terminal-llm-response">{block.content}</pre>
        <div className="message-status-indicator final">
          {block.duration !== undefined
            ? `for ${formatDuration(block.duration)} · ${modelShort}`
            : modelShort}
        </div>
      </div>
    )
  }

  // System block
  return (
    <div className="terminal-block terminal-block-system">
      <span className="terminal-system-icon">ℹ</span>
      <span className="terminal-system-text">{block.content}</span>
    </div>
  )
}

/**
 * LlmRunningBlock - Live-ticking running state for LLM workflow steps
 */
function LlmRunningBlock({ block }: { block: TerminalBlock }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 500)
    return () => clearInterval(id)
  }, [])
  const elapsed = Date.now() - block.startTime
  const modelShort = block.model?.split('/').pop() ?? 'model'
  return (
    <div className="terminal-block terminal-block-llm">
      <div className="message-status-indicator live">
        <span className="status-spinner">●</span>
        <span>Asking {modelShort}… ({formatDuration(elapsed)})</span>
      </div>
    </div>
  )
}

/**
 * ExitCodeBadge - Shows command exit status
 */
function ExitCodeBadge({ exitCode, status }: { exitCode: number; status: string }) {
  const isSuccess = exitCode === 0
  const className = `exit-code-badge ${isSuccess ? 'success' : 'failure'}`

  return (
    <span className={className}>
      {isSuccess ? '✓' : '✗'} {exitCode}
    </span>
  )
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`
  } else {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }
}
