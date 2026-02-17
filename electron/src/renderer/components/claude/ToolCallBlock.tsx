import React, { useState } from 'react'
import type { ToolCall } from '../../../shared/types'
import './ToolCallBlock.css'

interface ToolCallBlockProps {
  toolCall: ToolCall
  isStreaming?: boolean
}

// Tool icon mapping
const TOOL_ICONS: Record<string, string> = {
  Read: '📄',
  Write: '✏️',
  Edit: '🔧',
  Bash: '⚡',
  Grep: '🔍',
  Glob: '📁',
  Task: '🤖',
  WebSearch: '🌐',
  WebFetch: '🔗',
}

// Tool color mapping (for border/badge)
const TOOL_COLORS: Record<string, string> = {
  Read: '#3b82f6',    // blue
  Write: '#10b981',   // green
  Edit: '#f59e0b',    // amber
  Bash: '#8b5cf6',    // purple
  Grep: '#ec4899',    // pink
  Glob: '#6366f1',    // indigo
  Task: '#06b6d4',    // cyan
  WebSearch: '#14b8a6', // teal
  WebFetch: '#0ea5e9', // sky
}

export const ToolCallBlock: React.FC<ToolCallBlockProps> = ({ toolCall, isStreaming }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const icon = TOOL_ICONS[toolCall.name] || '🔧'
  const color = TOOL_COLORS[toolCall.name] || '#6b7280'

  // Format duration
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  // Get status badge
  const getStatusBadge = () => {
    if (isStreaming || toolCall.status === 'running') {
      return <span className="tool-status-badge running">Running...</span>
    }
    if (toolCall.status === 'error') {
      return <span className="tool-status-badge error">Error</span>
    }
    if (toolCall.status === 'completed' && toolCall.duration) {
      return <span className="tool-status-badge completed">{formatDuration(toolCall.duration)}</span>
    }
    return null
  }

  // Render tool-specific input parameters
  const renderInput = () => {
    switch (toolCall.name) {
      case 'Read':
        return (
          <div className="tool-param">
            <span className="tool-param-label">File:</span>
            <code className="tool-param-value">{toolCall.input.file_path}</code>
            {toolCall.input.offset && (
              <>
                <span className="tool-param-label">Lines:</span>
                <code className="tool-param-value">
                  {toolCall.input.offset}-{toolCall.input.offset + (toolCall.input.limit || 2000)}
                </code>
              </>
            )}
          </div>
        )

      case 'Write':
        return (
          <div className="tool-param">
            <span className="tool-param-label">File:</span>
            <code className="tool-param-value">{toolCall.input.file_path}</code>
          </div>
        )

      case 'Edit':
        return (
          <div className="tool-param">
            <span className="tool-param-label">File:</span>
            <code className="tool-param-value">{toolCall.input.file_path}</code>
          </div>
        )

      case 'Bash':
        return (
          <div className="tool-param">
            <span className="tool-param-label">Command:</span>
            <code className="tool-param-value">{toolCall.input.command}</code>
          </div>
        )

      case 'Grep':
        return (
          <div className="tool-param">
            <span className="tool-param-label">Pattern:</span>
            <code className="tool-param-value">{toolCall.input.pattern}</code>
            {toolCall.input.path && (
              <>
                <span className="tool-param-label">Path:</span>
                <code className="tool-param-value">{toolCall.input.path}</code>
              </>
            )}
          </div>
        )

      case 'Glob':
        return (
          <div className="tool-param">
            <span className="tool-param-label">Pattern:</span>
            <code className="tool-param-value">{toolCall.input.pattern}</code>
          </div>
        )

      case 'Task':
        return (
          <div className="tool-param">
            <span className="tool-param-label">Agent:</span>
            <code className="tool-param-value">{toolCall.input.subagent_type}</code>
            {toolCall.input.description && (
              <>
                <span className="tool-param-label">Task:</span>
                <span className="tool-param-value">{toolCall.input.description}</span>
              </>
            )}
          </div>
        )

      case 'WebSearch':
        return (
          <div className="tool-param">
            <span className="tool-param-label">Query:</span>
            <span className="tool-param-value">{toolCall.input.query}</span>
          </div>
        )

      case 'WebFetch':
        return (
          <div className="tool-param">
            <span className="tool-param-label">URL:</span>
            <code className="tool-param-value">{toolCall.input.url}</code>
          </div>
        )

      default:
        return (
          <div className="tool-param">
            <code className="tool-param-value">{JSON.stringify(toolCall.input, null, 2)}</code>
          </div>
        )
    }
  }

  // Render tool output (collapsible)
  const renderOutput = () => {
    if (!toolCall.output) return null

    // Handle Bash output
    if (toolCall.name === 'Bash' && typeof toolCall.output === 'object') {
      const bashOutput = toolCall.output as any
      return (
        <div className="tool-output">
          {bashOutput.stdout && (
            <div className="tool-output-section">
              <div className="tool-output-label">Output:</div>
              <pre className="tool-output-content">{bashOutput.stdout}</pre>
            </div>
          )}
          {bashOutput.stderr && (
            <div className="tool-output-section">
              <div className="tool-output-label error">Error Output:</div>
              <pre className="tool-output-content error">{bashOutput.stderr}</pre>
            </div>
          )}
          {bashOutput.exitCode !== undefined && bashOutput.exitCode !== 0 && (
            <div className="tool-output-section">
              <div className="tool-output-label">Exit Code:</div>
              <code className="tool-output-content">{bashOutput.exitCode}</code>
            </div>
          )}
        </div>
      )
    }

    // Handle string output (most common)
    if (typeof toolCall.output === 'string') {
      const outputStr = toolCall.output
      const isLong = outputStr.length > 500

      return (
        <div className="tool-output">
          <pre className="tool-output-content">
            {isLong && !isExpanded ? `${outputStr.slice(0, 500)}...` : outputStr}
          </pre>
          {isLong && (
            <button
              className="tool-output-toggle"
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded(!isExpanded)
              }}
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )
    }

    // Handle other object outputs
    return (
      <div className="tool-output">
        <pre className="tool-output-content">{JSON.stringify(toolCall.output, null, 2)}</pre>
      </div>
    )
  }

  // Render error message
  const renderError = () => {
    if (!toolCall.error) return null

    return (
      <div className="tool-error">
        <div className="tool-error-label">Error:</div>
        <div className="tool-error-content">{toolCall.error}</div>
      </div>
    )
  }

  const hasOutput = toolCall.status === 'completed' && toolCall.output
  const hasError = toolCall.status === 'error'
  const canExpand = hasOutput || hasError

  return (
    <div className="tool-call-block" style={{ borderLeftColor: color }}>
      <div
        className={`tool-call-header ${canExpand ? 'clickable' : ''}`}
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
      >
        <span className="tool-icon">{icon}</span>
        <span className="tool-name">{toolCall.name}</span>
        <div className="tool-header-right">
          {getStatusBadge()}
          {canExpand && (
            <span className="tool-expand-icon">{isExpanded ? '▼' : '▶'}</span>
          )}
        </div>
      </div>

      <div className="tool-call-content">
        {renderInput()}
        {isExpanded && hasOutput && renderOutput()}
        {isExpanded && hasError && renderError()}
      </div>
    </div>
  )
}
