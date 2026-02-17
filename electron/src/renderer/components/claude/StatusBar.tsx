import React, { useState } from 'react'
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
  workingDir: string
  onModeChange: (mode: 'default' | 'acceptEdits' | 'plan') => void
  onModelChange: (model: string) => void
  onContainerToggle: () => void
  onBranchClick: () => void
}

const MODEL_OPTIONS = [
  { id: 'default', label: 'Opus 4.6', description: 'Most capable' },
  { id: 'sonnet', label: 'Sonnet 4.5', description: 'Best for everyday tasks' },
  { id: 'haiku', label: 'Haiku 4.5', description: 'Fastest' },
]

const MODE_OPTIONS = [
  { id: 'default' as 'default', label: 'Default', description: 'Standard behavior' },
  { id: 'acceptEdits' as 'acceptEdits', label: 'Accept Edits', description: 'Auto-accept edits' },
  { id: 'plan' as 'plan', label: 'Plan', description: 'Planning only' },
]

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  model,
  gitBranch,
  gitStats,
  tokenUsage,
  containerStatus,
  containerError,
  workingDir,
  onModeChange,
  onModelChange,
  onContainerToggle,
  onBranchClick,
}) => {
  const [showCopied, setShowCopied] = useState(false)

  // Get last two parts of path (e.g., "Develop/gemra" from "/Users/benjmarston/Develop/gemra")
  const getShortPath = (path: string): string => {
    const parts = path.split('/').filter(Boolean)
    return parts.slice(-2).join('/')
  }

  const handleCopyPath = () => {
    navigator.clipboard.writeText(workingDir)
    setShowCopied(true)
    setTimeout(() => setShowCopied(false), 1500)
  }

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
        if (containerError) {
          if (containerError.includes('not running')) {
            return 'Start Docker'
          } else if (containerError.includes('not installed')) {
            return 'Install Docker'
          } else if (containerError.includes('OrbStack')) {
            return 'Start OrbStack'
          } else if (containerError.includes('Docker Desktop')) {
            return 'Start Docker Desktop'
          }
          return 'Error'
        }
        return 'Error'
      default:
        return 'Unknown'
    }
  }

  const getContainerColor = () => {
    switch (containerStatus) {
      case 'disabled':
        return 'var(--text-secondary)'
      case 'building':
      case 'starting':
        return 'var(--container-building)'
      case 'running':
        return 'var(--container-running)'
      case 'error':
        return 'var(--container-error)'
      default:
        return 'var(--text-secondary)'
    }
  }

  const isContainerClickable = () => {
    return containerStatus === 'disabled' || containerStatus === 'running' || containerStatus === 'error'
  }

  return (
    <div className="status-bar">
      {/* Working directory */}
      <div className="status-bar-section">
        <span className="status-bar-label">Directory:</span>
        <div
          onClick={handleCopyPath}
          title={`${workingDir}\n\nClick to copy path`}
          className="status-bar-directory"
        >
          <span>{getShortPath(workingDir)}</span>
          {showCopied && <span>Copied</span>}
        </div>
      </div>

      <Separator />

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
      <div className="status-bar-section">
        <span className="status-bar-label">Container:</span>
        <button
          onClick={isContainerClickable() ? onContainerToggle : undefined}
          disabled={!isContainerClickable()}
          title={containerError || undefined}
          className="status-bar-container"
          style={{ color: getContainerColor() }}
        >
          {containerStatus === 'running' && (
            <span
              className="status-bar-container-indicator"
              style={{ backgroundColor: getContainerColor() }}
            />
          )}
          {(containerStatus === 'building' || containerStatus === 'starting') && (
            <span className="status-bar-container-spinner" />
          )}
          {containerStatus === 'error' && '✕ '}
          {getContainerLabel()}
        </button>
      </div>

      <Separator />

      {/* Git status chips - connected branch and file changes */}
      <div className="git-status-chips">
        {/* Left chip: Git branch */}
        <button
          onClick={onBranchClick}
          className="git-chip git-chip-branch"
          title="Click to checkout branch"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="git-chip-icon"
          >
            <circle cx="3" cy="3" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="13" cy="13" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="13" cy="3" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M3 5 L3 11 Q3 13 5 13 L11 13" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M13 5 L13 11" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
          <span className="git-chip-text git-chip-branch-name">{gitBranch}</span>
        </button>

        {/* Right chip: File changes */}
        <button
          className="git-chip git-chip-files"
          title="File changes"
          disabled
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="git-chip-icon"
          >
            <path
              d="M3 2 L3 14 L13 14 L13 6 L9 2 L3 2 Z"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M9 2 L9 6 L13 6"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
          <span className="git-chip-text">
            {gitStats.filesChanged}
          </span>
          <span className="git-chip-separator">•</span>
          <span className="git-chip-additions">+{gitStats.insertions}</span>
          <span className="git-chip-deletions">-{gitStats.deletions}</span>
        </button>
      </div>

      {/* Spacer to push context indicator to the right */}
      <div className="status-bar-spacer" />

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
