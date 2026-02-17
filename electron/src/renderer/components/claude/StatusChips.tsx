import React from 'react'
import { StatusChip } from './StatusChip'
import { ContainerStatusChip } from './ContainerStatusChip'
import type { ContainerStatus } from '../../../shared/types'

interface GitStats {
  filesChanged: number
  insertions: number
  deletions: number
}

interface StatusChipsProps {
  workingDir: string
  gitBranch: string
  gitStats: GitStats
  containerStatus: ContainerStatus
  containerError?: string
  onBranchClick: () => void
  onContainerToggle: () => void
}

export const StatusChips: React.FC<StatusChipsProps> = ({
  workingDir,
  gitBranch,
  gitStats,
  containerStatus,
  containerError,
  onBranchClick,
  onContainerToggle,
}) => {
  // Format directory to show last two segments
  const formatDirectory = (path: string): string => {
    const segments = path.split('/').filter(Boolean)
    if (segments.length <= 2) {
      return segments.join('/')
    }
    return segments.slice(-2).join('/')
  }

  // Copy full path to clipboard
  const handleDirectoryClick = () => {
    navigator.clipboard.writeText(workingDir).then(() => {
      console.log('[StatusChips] Copied directory to clipboard:', workingDir)
    }).catch((err) => {
      console.error('[StatusChips] Failed to copy directory:', err)
    })
  }

  return (
    <div className="status-chips-container">
      <StatusChip
        text={formatDirectory(workingDir)}
        onClick={handleDirectoryClick}
        title={`Working directory: ${workingDir}\nClick to copy full path`}
      />

      {/* Git status - connected chips */}
      <div className="git-status-chips">
        {/* Left chip: Git branch */}
        <button
          onClick={onBranchClick}
          className="git-chip git-chip-branch"
          title={`Current branch: ${gitBranch}\nClick to checkout another branch`}
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
          title={`Uncommitted changes:\n${gitStats.filesChanged} files changed\n${gitStats.insertions} insertions\n${gitStats.deletions} deletions`}
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

      <ContainerStatusChip
        status={containerStatus}
        error={containerError}
        onClick={onContainerToggle}
      />
    </div>
  )
}
