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
      className={`tab-item ${tab.isActive ? 'active' : ''}`}
    >
      <span className="tab-item-title">
        {tab.title}
      </span>
      <button
        onClick={handleClose}
        className="tab-item-close"
      >
        <X size={14} color="#b0b0b0" />
      </button>
    </div>
  )
}
