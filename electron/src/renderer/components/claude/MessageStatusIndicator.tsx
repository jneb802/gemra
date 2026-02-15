import React from 'react'
import type { MessageMetadata } from '../../../shared/types'

interface MessageStatusIndicatorProps {
  metadata: MessageMetadata
  isLive?: boolean
}

export const MessageStatusIndicator: React.FC<MessageStatusIndicatorProps> = ({
  metadata,
  isLive = false,
}) => {
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
    return tokens.toString()
  }

  // Live status during streaming
  if (isLive && !metadata.isComplete) {
    const elapsed = Date.now() - (metadata.startTime || Date.now())

    const verb =
      metadata.currentPhase === 'thinking'
        ? 'Thinking'
        : metadata.currentPhase === 'streaming'
          ? 'Writing'
          : metadata.currentPhase === 'tool_execution'
            ? 'Working'
            : 'Processing'

    const parts = [`${verb}... (${formatDuration(elapsed)}`]

    if (metadata.outputTokens) {
      parts.push(` · ↓ ${formatTokens(metadata.outputTokens)} tokens`)
    }

    if (metadata.thinkingTime && metadata.currentPhase !== 'thinking') {
      parts.push(` · thought for ${formatDuration(metadata.thinkingTime)}`)
    }

    parts.push(')')

    return (
      <div className="message-status-indicator live">
        <span className="status-spinner">●</span>
        <span>{parts.join('')}</span>
      </div>
    )
  }

  // Final status after completion
  if (metadata.isComplete && metadata.totalDuration) {
    const parts = [`Sautéed for ${formatDuration(metadata.totalDuration)}`]

    if (metadata.outputTokens) {
      parts.push(` · ↓ ${formatTokens(metadata.outputTokens)} tokens`)
    }

    if (metadata.thinkingTime && metadata.thinkingTime > 1000) {
      parts.push(` · thought for ${formatDuration(metadata.thinkingTime)}`)
    }

    return <div className="message-status-indicator final">{parts.join('')}</div>
  }

  return null
}
