import React from 'react'
import type { AgentStatus } from '../../../shared/types'

/**
 * Status indicators for Claude agent activity
 * Shows thinking, streaming, tool execution, initialization, and error states
 */

interface StatusIndicatorsProps {
  agentStatus: AgentStatus
  isWorking: boolean
  isInitializingAgent: boolean
  error: string | null
}

// Helper to get tool display name
const getToolDisplayName = (toolName: string): string => {
  const toolMap: Record<string, string> = {
    Read: 'Reading file',
    Write: 'Writing file',
    Edit: 'Editing file',
    Bash: 'Running command',
    Grep: 'Searching code',
    Glob: 'Finding files',
    Task: 'Spawning agent',
    WebSearch: 'Searching web',
    WebFetch: 'Fetching URL'
  }
  return toolMap[toolName] || `Running ${toolName}`
}

export const StatusIndicators: React.FC<StatusIndicatorsProps> = ({
  agentStatus,
  isWorking,
  isInitializingAgent,
  error
}) => {
  return (
    <>
      {/* Thinking indicator */}
      {agentStatus.type === 'thinking' && (
        <div className="status-indicator thinking">
          <span className="status-icon">🤔</span>
          <span className="status-text">Thinking...</span>
        </div>
      )}

      {/* Streaming indicator */}
      {agentStatus.type === 'streaming' && isWorking && (
        <div className="status-indicator streaming">
          <span className="status-icon">✍️</span>
          <span className="status-text">Writing response...</span>
        </div>
      )}

      {/* Tool execution indicator */}
      {agentStatus.type === 'tool_execution' && agentStatus.tool && (
        <div className="status-indicator tool-execution">
          <span className="status-icon">🔧</span>
          <span className="status-text">{getToolDisplayName(agentStatus.tool.name)}</span>
          {agentStatus.tool.name === 'Read' && agentStatus.tool.input?.file_path && (
            <span className="status-detail">{agentStatus.tool.input.file_path}</span>
          )}
          {agentStatus.tool.name === 'Bash' && agentStatus.tool.input?.command && (
            <span className="status-detail">{agentStatus.tool.input.command}</span>
          )}
          {agentStatus.tool.name === 'Grep' && agentStatus.tool.input?.pattern && (
            <span className="status-detail">"{agentStatus.tool.input.pattern}"</span>
          )}
        </div>
      )}

      {/* Initialization indicator */}
      {isInitializingAgent && (
        <div className="status-indicator thinking">
          <span className="status-icon">🚀</span>
          <span className="status-text">Starting Claude Code agent...</span>
        </div>
      )}

      {/* Error indicator */}
      {error && <div className="error-message">Error: {error}</div>}
    </>
  )
}
