import { Plus } from 'lucide-react'
import { useTabStore } from '../../stores/tabStore'
import { TabItem } from './TabItem'

interface TabBarProps {
  onNewTab: () => void
}

export function TabBar({ onNewTab }: TabBarProps) {
  const tabs = useTabStore((state) => state.tabs)
  const setActiveTab = useTabStore((state) => state.setActiveTab)
  const closeTab = useTabStore((state) => state.closeTab)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#1e1e1e',
        borderBottom: '1px solid #3e3e3e',
        height: '36px',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* macOS traffic light spacing */}
      <div style={{ width: '70px', flexShrink: 0 }} />

      {/* Tab items */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            onSelect={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
          />
        ))}
      </div>

      {/* New tab button */}
      <button
        onClick={onNewTab}
        title="New Tab"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          padding: 0,
          border: 'none',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          flexShrink: 0,
          WebkitAppRegion: 'no-drag',
          transition: 'background-color 0.15s ease',
        } as React.CSSProperties}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#2d2d2d'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <Plus size={16} color="#b0b0b0" />
      </button>
    </div>
  )
}
