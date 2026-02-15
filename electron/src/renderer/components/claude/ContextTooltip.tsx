import React from 'react'

interface ContextTooltipProps {
  visible: boolean
  inputTokens: number
  outputTokens: number
  maxTokens: number
}

export const ContextTooltip: React.FC<ContextTooltipProps> = ({
  visible,
  inputTokens,
  outputTokens,
  maxTokens,
}) => {
  if (!visible) return null

  const totalTokens = inputTokens + outputTokens
  const percentage = (totalTokens / maxTokens) * 100

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`
    }
    return tokens.toString()
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: '8px',
        backgroundColor: '#2d2d2d',
        border: '1px solid #3e3e3e',
        borderRadius: '4px',
        padding: '8px 12px',
        fontSize: '12px',
        color: '#d4d4d4',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: '4px' }}>
        {percentage.toFixed(1)}% context used
      </div>
      <div style={{ color: '#888' }}>
        {formatTokens(totalTokens)} / {formatTokens(maxTokens)}
      </div>
    </div>
  )
}
