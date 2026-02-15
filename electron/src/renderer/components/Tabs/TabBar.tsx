import { Plus, Container } from 'lucide-react'
import { useTabStore } from '../../stores/tabStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { TabItem } from './TabItem'

interface TabBarProps {
  onNewTab: () => void
  onCloseTab: (id: string) => void
}

export function TabBar({ onNewTab, onCloseTab }: TabBarProps) {
  const tabs = useTabStore((state) => state.tabs)
  const setActiveTab = useTabStore((state) => state.setActiveTab)
  const useDocker = useSettingsStore((state) => state.useDocker)
  const updateSettings = useSettingsStore((state) => state.updateSettings)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#1e1e1e',
        borderBottom: '1px solid #3e3e3e',
        height: '40px',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* macOS traffic light spacing */}
      <div style={{ width: '72px', flexShrink: 0 }} />

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
            onClose={() => onCloseTab(tab.id)}
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
          width: '40px',
          height: '40px',
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

      {/* Docker toggle button */}
      <button
        onClick={() => updateSettings({ useDocker: !useDocker })}
        title={useDocker ? 'Docker mode enabled' : 'Docker mode disabled'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          padding: 0,
          border: 'none',
          backgroundColor: useDocker ? '#2d2d2d' : 'transparent',
          cursor: 'pointer',
          flexShrink: 0,
          WebkitAppRegion: 'no-drag',
          transition: 'all 0.2s ease',
        } as React.CSSProperties}
        onMouseEnter={(e) => {
          if (!useDocker) {
            e.currentTarget.style.backgroundColor = '#2d2d2d'
          }
        }}
        onMouseLeave={(e) => {
          if (!useDocker) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <Container size={18} color={useDocker ? '#569cd6' : '#888888'} />
      </button>
    </div>
  )
}
