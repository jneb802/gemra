import React from 'react'
import { ContainerStatusChip } from './ContainerStatusChip'
import { Tooltip } from '../common/Tooltip'
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
  dangerouslySkipPermissions?: boolean
}

export const StatusChips: React.FC<StatusChipsProps> = ({
  workingDir, // Kept for backwards compatibility but no longer displayed
  gitBranch,
  gitStats,
  containerStatus,
  containerError,
  onBranchClick,
  onContainerToggle,
  dangerouslySkipPermissions = false,
}) => {
  return (
    <div className="status-chips-container">
      {/* Danger chip - shown when dangerously skip permissions is enabled */}
      {dangerouslySkipPermissions && (
        <Tooltip content="⚠️ Dangerously Skip Permissions mode enabled\nAll commands execute without approval prompts">
          <div className="danger-chip">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="danger-chip-icon"
            >
              <path
                d="M8 1.5 L14.5 13.5 L1.5 13.5 Z"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinejoin="round"
              />
              <path
                d="M8 6 L8 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle
                cx="8"
                cy="11"
                r="0.5"
                fill="currentColor"
              />
            </svg>
            <span className="danger-chip-text">Danger</span>
          </div>
        </Tooltip>
      )}

      {/* Git status - connected chips */}
      <div className="git-status-chips">
        {/* Left chip: Git branch */}
        <Tooltip content={`Current branch: ${gitBranch}\nClick to checkout another branch`}>
          <button
            onClick={onBranchClick}
            className="git-chip git-chip-branch"
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
        </Tooltip>

        {/* Right chip: File changes */}
        <Tooltip content={`Uncommitted changes:\n${gitStats.filesChanged} files changed\n${gitStats.insertions} insertions\n${gitStats.deletions} deletions`}>
          <button
            className="git-chip git-chip-files"
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
        </Tooltip>
      </div>

      <ContainerStatusChip
        status={containerStatus}
        error={containerError}
        onClick={onContainerToggle}
      />
    </div>
  )
}
