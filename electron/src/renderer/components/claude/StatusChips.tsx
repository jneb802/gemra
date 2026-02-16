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

  // Format git stats
  const formatGitStats = (stats: GitStats): string => {
    return `${stats.filesChanged} • +${stats.insertions} -${stats.deletions}`
  }

  const hasGitChanges = gitStats.filesChanged > 0

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
      }}
    >
      <StatusChip
        text={formatDirectory(workingDir)}
        onClick={handleDirectoryClick}
        title={`Working directory: ${workingDir}\nClick to copy full path`}
      />

      <StatusChip
        text={gitBranch}
        onClick={onBranchClick}
        title={`Current branch: ${gitBranch}\nClick to checkout another branch`}
      />

      {hasGitChanges && (
        <StatusChip
          text={formatGitStats(gitStats)}
          title={`Uncommitted changes:\n${gitStats.filesChanged} files changed\n${gitStats.insertions} insertions\n${gitStats.deletions} deletions`}
        />
      )}

      <ContainerStatusChip
        status={containerStatus}
        error={containerError}
        onClick={onContainerToggle}
      />
    </div>
  )
}
