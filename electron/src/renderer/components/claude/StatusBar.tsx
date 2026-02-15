import React from 'react'
import { ContextIndicator } from './ContextIndicator'
import { DropdownMenu, Separator } from '../common'

interface StatusBarProps {
  mode: 'default' | 'acceptEdits' | 'plan'
  model: string
  gitBranch: string
  gitStats: {
    filesChanged: number
    insertions: number
    deletions: number
  }
  tokenUsage: {
    inputTokens: number
    outputTokens: number
  }
  onModeChange: (mode: 'default' | 'acceptEdits' | 'plan') => void
  onModelChange: (model: string) => void
}

const MODEL_OPTIONS = [
  { id: 'default', label: 'Opus 4.6', description: 'Most capable' },
  { id: 'sonnet', label: 'Sonnet 4.5', description: 'Best for everyday tasks' },
  { id: 'haiku', label: 'Haiku 4.5', description: 'Fastest' },
] as const

const MODE_OPTIONS = [
  { id: 'default' as const, label: 'Default', description: 'Standard behavior' },
  { id: 'acceptEdits' as const, label: 'Accept Edits', description: 'Auto-accept edits' },
  { id: 'plan' as const, label: 'Plan', description: 'Planning only' },
] as const

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  model,
  gitBranch,
  gitStats,
  tokenUsage,
  onModeChange,
  onModelChange,
}) => {
  const hasGitChanges = gitStats.filesChanged > 0 || gitStats.insertions > 0 || gitStats.deletions > 0

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        height: '32px',
        padding: '0 16px',
        backgroundColor: '#252525',
        borderTop: '1px solid #3e3e3e',
        fontSize: '12px',
        color: '#888',
      }}
    >
      {/* Model selector */}
      <DropdownMenu
        label="Model"
        value={model}
        options={MODEL_OPTIONS}
        onChange={onModelChange}
      />

      <Separator />

      {/* Mode selector */}
      <DropdownMenu
        label="Mode"
        value={mode}
        options={MODE_OPTIONS}
        onChange={onModeChange}
      />

      <Separator />

      {/* Git branch */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#666' }}>Branch:</span>
        <span
          style={{
            color: '#b0b0b0',
            fontFamily: 'Monaco, Menlo, Consolas, monospace',
          }}
        >
          {gitBranch}
        </span>
      </div>

      {/* Git stats - only show if there are changes */}
      {hasGitChanges && (
        <>
          <Separator />

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {gitStats.filesChanged > 0 && (
              <span style={{ color: '#b0b0b0' }}>
                {gitStats.filesChanged} file{gitStats.filesChanged !== 1 ? 's' : ''}
              </span>
            )}
            {gitStats.insertions > 0 && (
              <span style={{ color: '#4ade80' }}>+{gitStats.insertions}</span>
            )}
            {gitStats.deletions > 0 && (
              <span style={{ color: '#f87171' }}>-{gitStats.deletions}</span>
            )}
          </div>
        </>
      )}

      {/* Spacer to push context indicator to the right */}
      <div style={{ flex: 1 }} />

      <Separator />

      {/* Context indicator */}
      <ContextIndicator
        inputTokens={tokenUsage.inputTokens}
        outputTokens={tokenUsage.outputTokens}
        model={model}
      />
    </div>
  )
}
