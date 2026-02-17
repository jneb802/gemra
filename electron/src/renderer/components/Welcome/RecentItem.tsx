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
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        backgroundColor: 'transparent',
        border: '1px solid transparent',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        color: 'var(--text-primary)',
        width: '100%',
        textAlign: 'left'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
        e.currentTarget.style.borderColor = 'var(--border-color)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
        e.currentTarget.style.borderColor = 'transparent'
      }}
    >
      <Folder size={20} color="var(--button-primary)" />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ fontSize: '14px', fontWeight: 500 }}>
            {item.name}
          </span>
          {item.gitBranch && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                backgroundColor: '#264f78',
                borderRadius: '10px',
                fontSize: '11px',
                color: '#4fc3f7'
              }}
            >
              <GitBranch size={10} />
              {item.gitBranch}
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.path}
        </div>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
        {formatTimestamp(item.timestamp)}
      </div>
    </button>
  )
}
