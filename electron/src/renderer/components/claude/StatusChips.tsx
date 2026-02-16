import React from 'react'
import { StatusChip } from './StatusChip'

interface GitStats {
  filesChanged: number
  insertions: number
  deletions: number
}

interface StatusChipsProps {
  workingDir: string
  gitBranch: string
  gitStats: GitStats
  onBranchClick: () => void
}

export const StatusChips: React.FC<StatusChipsProps> = ({
  workingDir,
  gitBranch,
  gitStats,
  onBranchClick,
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
    <div className="status-chips-container">
      <StatusChip
        icon="📁"
        text={formatDirectory(workingDir)}
        onClick={handleDirectoryClick}
        title={`Working directory: ${workingDir}\nClick to copy full path`}
      />

      <StatusChip
        icon="🌿"
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
    </div>
  )
}
