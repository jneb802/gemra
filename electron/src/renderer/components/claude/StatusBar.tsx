import React from 'react'
import { ContextIndicator } from './ContextIndicator'
import { DropdownMenu, Separator } from '../common'
import type { ContainerStatus } from '../../../shared/types'

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
  containerStatus: ContainerStatus
  containerError?: string
  onModeChange: (mode: 'default' | 'acceptEdits' | 'plan') => void
  onModelChange: (model: string) => void
  onContainerToggle: () => void
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
  containerStatus,
  containerError,
  onModeChange,
  onModelChange,
  onContainerToggle,
}) => {
  const hasGitChanges = gitStats.filesChanged > 0 || gitStats.insertions > 0 || gitStats.deletions > 0

  const getContainerLabel = () => {
    switch (containerStatus) {
      case 'disabled':
        return 'Off'
      case 'building':
        return 'Building image...'
      case 'starting':
        return 'Starting...'
      case 'running':
        return 'Running'
      case 'error':
        return 'Error'
      default:
        return 'Unknown'
    }
  }

  const getContainerColor = () => {
    switch (containerStatus) {
      case 'disabled':
        return '#888'
      case 'building':
      case 'starting':
        return '#f59e0b' // Orange
      case 'running':
        return '#4ade80' // Green
      case 'error':
        return '#f87171' // Red
      default:
        return '#888'
    }
  }

  const isContainerClickable = () => {
    return containerStatus === 'disabled' || containerStatus === 'running'
  }

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

      {/* Container status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#666' }}>Container:</span>
        <button
          onClick={isContainerClickable() ? onContainerToggle : undefined}
          disabled={!isContainerClickable()}
          title={containerError || undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: getContainerColor(),
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: isContainerClickable() ? 'pointer' : 'default',
            fontSize: '12px',
            opacity: isContainerClickable() ? 1 : 0.6,
          }}
        >
          {containerStatus === 'running' && (
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: getContainerColor()
            }} />
          )}
          {(containerStatus === 'building' || containerStatus === 'starting') && (
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              border: '1.5px solid currentColor',
              borderTopColor: 'transparent',
              animation: 'spin 1s linear infinite'
            }} />
          )}
          {containerStatus === 'error' && '✕ '}
          {getContainerLabel()}
        </button>
      </div>

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
