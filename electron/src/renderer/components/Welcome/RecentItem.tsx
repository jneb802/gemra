import React from 'react'
import { Folder, GitBranch } from 'lucide-react'
import type { RecentDirectory } from '@renderer/stores/recentStore'

interface RecentItemProps {
  item: RecentDirectory
  onClick: () => void
}

const formatTimestamp = (timestamp: number): string => {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

export const RecentItem: React.FC<RecentItemProps> = ({ item, onClick }) => {
  return (
    <button className="recent-item" onClick={onClick}>
      <Folder size={20} color="var(--button-primary)" />

      <div className="recent-item__info">
        <div className="recent-item__name-row">
          <span className="recent-item__name">{item.name}</span>
          {item.gitBranch && (
            <span className="recent-item__branch">
              <GitBranch size={10} />
              {item.gitBranch}
            </span>
          )}
        </div>
        <div className="recent-item__path">{item.path}</div>
      </div>

      <div className="recent-item__timestamp">{formatTimestamp(item.timestamp)}</div>
    </button>
  )
}
