import React, { useState } from 'react'

interface CompactContextIndicatorProps {
  inputTokens: number
  outputTokens: number
  model: string
}

const MODEL_LIMITS: Record<string, number> = {
  opus: 200000, // Opus 4.6
  sonnet: 200000, // Sonnet 4.5
  haiku: 200000, // Haiku 4.5
}

export const CompactContextIndicator: React.FC<CompactContextIndicatorProps> = ({
  inputTokens,
  outputTokens,
  model,
}) => {
  const [showTooltip, setShowTooltip] = useState(false)

  const maxTokens = MODEL_LIMITS[model] || 200000
  const totalTokens = inputTokens + outputTokens
  const percentage = Math.min((totalTokens / maxTokens) * 100, 100)

  // Format large numbers (e.g., 50000 -> "50K")
  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000) {
      return `${Math.round(tokens / 1000)}K`
    }
    return tokens.toString()
  }

  // Get color based on usage percentage
  const getColor = () => {
    if (percentage >= 90) return '#f87171' // Red
    if (percentage >= 75) return '#f59e0b' // Orange
    if (percentage >= 50) return '#fbbf24' // Yellow
    return '#888' // Gray
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        backgroundColor: '#2a2a2a',
        border: '1px solid #3a3a3a',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        color: getColor(),
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      title={`${totalTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens\nInput: ${inputTokens.toLocaleString()}\nOutput: ${outputTokens.toLocaleString()}`}
    >
      <span>{formatTokens(totalTokens)}</span>

      {/* Tooltip */}
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: '8px',
            padding: '8px 12px',
            backgroundColor: '#2a2a2a',
            border: '1px solid #3a3a3a',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ color: '#888' }}>
              <span style={{ color: '#4a9eff' }}>{inputTokens.toLocaleString()}</span> in
              {' + '}
              <span style={{ color: '#4ade80' }}>{outputTokens.toLocaleString()}</span> out
            </div>
            <div style={{ color: '#666', fontSize: '11px' }}>
              {totalTokens.toLocaleString()} / {maxTokens.toLocaleString()} ({Math.round(percentage)}%)
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
