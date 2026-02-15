import { X } from 'lucide-react'
import type { Tab } from '../../stores/tabStore'

interface TabItemProps {
  tab: Tab
  onSelect: () => void
  onClose: () => void
}

export function TabItem({ tab, onSelect, onClose }: TabItemProps) {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        height: '40px',
        padding: '0 16px',
        backgroundColor: tab.isActive ? '#2d2d2d' : '#1e1e1e',
        borderRight: '1px solid #3e3e3e',
        cursor: 'pointer',
        userSelect: 'none',
        minWidth: '120px',
        maxWidth: '200px',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!tab.isActive) {
          e.currentTarget.style.backgroundColor = '#252525'
        }
      }}
      onMouseLeave={(e) => {
        if (!tab.isActive) {
          e.currentTarget.style.backgroundColor = '#1e1e1e'
        }
      }}
    >
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '13px',
          color: tab.isActive ? '#ffffff' : '#b0b0b0',
        }}
      >
        {tab.title}
      </span>
      <button
        onClick={handleClose}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '16px',
          height: '16px',
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          opacity: 0.6,
          transition: 'opacity 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.6'
        }}
      >
        <X size={14} color="#b0b0b0" />
      </button>
    </div>
  )
}
