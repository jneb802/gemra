import { X, Terminal, MessageSquare } from 'lucide-react'
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

  const isTerminal = tab.type === 'terminal'
  const Icon = isTerminal ? Terminal : MessageSquare

  return (
    <div
      onClick={onSelect}
      className={`tab-item ${tab.isActive ? 'active' : ''} ${isTerminal ? 'tab-item-terminal' : 'tab-item-chat'}`}
    >
      <Icon size={14} color={tab.isActive ? '#ffffff' : '#888888'} />
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
