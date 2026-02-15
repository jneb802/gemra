import React, { useState } from 'react'
import { CircularProgress } from './CircularProgress'
import { ContextTooltip } from './ContextTooltip'

interface ContextIndicatorProps {
  inputTokens: number
  outputTokens: number
  model: string
}

const MODEL_LIMITS: Record<string, number> = {
  default: 200000, // Opus 4.6
  sonnet: 200000, // Sonnet 4.5
  haiku: 200000, // Haiku 4.5
}

export const ContextIndicator: React.FC<ContextIndicatorProps> = ({
  inputTokens,
  outputTokens,
  model,
}) => {
  const [showTooltip, setShowTooltip] = useState(false)

  const maxTokens = MODEL_LIMITS[model] || 200000
  const totalTokens = inputTokens + outputTokens
  const percentage = Math.min((totalTokens / maxTokens) * 100, 100)

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <CircularProgress percentage={percentage} />
      <ContextTooltip
        visible={showTooltip}
        inputTokens={inputTokens}
        outputTokens={outputTokens}
        maxTokens={maxTokens}
      />
    </div>
  )
}
