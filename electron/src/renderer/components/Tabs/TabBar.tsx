import { useState } from 'react'
import { Plus, MessageSquare, Terminal } from 'lucide-react'
import { useTabStore } from '../../stores/tabStore'
import { TabItem } from './TabItem'

interface TabBarProps {
  onNewTab: () => void
  onNewTerminal: () => void
  onCloseTab: (id: string) => void
}

export function TabBar({ onNewTab, onNewTerminal, onCloseTab }: TabBarProps) {
  const tabs = useTabStore((state) => state.tabs)
  const setActiveTab = useTabStore((state) => state.setActiveTab)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const handleNewChat = () => {
    setDropdownOpen(false)
    onNewTab()
  }

  const handleNewTerminal = () => {
    setDropdownOpen(false)
    onNewTerminal()
  }

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

        {/* New tab button with dropdown */}
        <div className="tab-bar-new-button-wrapper">
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            title="New Tab"
            className="tab-bar-new-button"
          >
            <Plus size={16} color="#b0b0b0" />
          </button>

          {dropdownOpen && (
            <>
              <div
                className="tab-bar-new-dropdown-overlay"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="tab-bar-new-dropdown">
                <button className="tab-bar-new-dropdown-item" onClick={handleNewChat}>
                  <MessageSquare size={14} />
                  New Chat
                </button>
                <button className="tab-bar-new-dropdown-item" onClick={handleNewTerminal}>
                  <Terminal size={14} />
                  New Terminal
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
