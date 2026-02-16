import { Plus } from 'lucide-react'
import { useTabStore } from '../../stores/tabStore'
import { TabItem } from './TabItem'

interface TabBarProps {
  onNewTab: () => void
  onCloseTab: (id: string) => void
}

export function TabBar({ onNewTab, onCloseTab }: TabBarProps) {
  const tabs = useTabStore((state) => state.tabs)
  const setActiveTab = useTabStore((state) => state.setActiveTab)

  return (
    <div className="tab-bar">
      {/* macOS traffic light spacing */}
      <div className="tab-bar-spacer" />

      {/* Tab items */}
      <div className="tab-bar-tabs">
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            onSelect={() => setActiveTab(tab.id)}
            onClose={() => onCloseTab(tab.id)}
          />
        ))}
      </div>

      {/* New tab button */}
      <button
        onClick={onNewTab}
        title="New Tab"
        className="tab-bar-new-button"
      >
        <Plus size={16} color="#b0b0b0" />
      </button>
    </div>
  )
}
