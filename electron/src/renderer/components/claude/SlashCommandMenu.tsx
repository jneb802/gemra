import React, { useState, useMemo, useImperativeHandle, forwardRef } from 'react'
import { MenuItem } from '../common/MenuItem'

export interface SlashCommand {
  name: string
  description: string
  argumentHint?: string
}

interface SlashCommandMenuProps {
  query: string
  customCommands: SlashCommand[]
  claudeCommands: SlashCommand[]
  onSelectCommand: (command: SlashCommand, category: 'custom' | 'claude') => void
  onClose: () => void
  customTabLabel?: string
  claudeTabLabel?: string
}

export interface SlashCommandMenuHandle {
  toggleTab: () => void
  navigate: (direction: number) => void
  executeSelected: () => void
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
  ({ query, customCommands, claudeCommands, onSelectCommand, onClose, customTabLabel = 'Custom Commands', claudeTabLabel = 'Claude Commands' }, ref) => {
    const [activeTab, setActiveTab] = useState<'custom' | 'claude'>('custom')
    const [selectedIndex, setSelectedIndex] = useState(0)

    // Filter commands based on query
    const filteredCommands = useMemo(() => {
      const source = activeTab === 'custom' ? customCommands : claudeCommands
      if (!query) return source

      const lowerQuery = query.toLowerCase()
      return source.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(lowerQuery) ||
          cmd.description.toLowerCase().includes(lowerQuery)
      )
    }, [activeTab, query, customCommands, claudeCommands])

    // Reset selected index when filtered commands change
    React.useEffect(() => {
      setSelectedIndex(0)
    }, [filteredCommands])

    // Expose imperative methods
    useImperativeHandle(ref, () => ({
      toggleTab: () => {
        setActiveTab((current) => (current === 'custom' ? 'claude' : 'custom'))
        setSelectedIndex(0)
      },
      navigate: (direction: number) => {
        setSelectedIndex((current) => {
          const newIndex = current + direction
          // Wrap around at boundaries
          if (newIndex < 0) return filteredCommands.length - 1
          if (newIndex >= filteredCommands.length) return 0
          return newIndex
        })
      },
      executeSelected: () => {
        const selectedCommand = filteredCommands[selectedIndex]
        if (selectedCommand) {
          onSelectCommand(selectedCommand, activeTab)
          onClose()
        }
      },
    }))

    return (
      <div className="slash-command-menu">
        {/* Tab header */}
        <div className="slash-command-tabs">
          <button
            onClick={() => {
              setActiveTab('custom')
              setSelectedIndex(0)
            }}
            className={`slash-command-tab ${activeTab === 'custom' ? 'active' : ''}`}
          >
            {customTabLabel}
          </button>
          <button
            onClick={() => {
              setActiveTab('claude')
              setSelectedIndex(0)
            }}
            className={`slash-command-tab ${activeTab === 'claude' ? 'active' : ''}`}
          >
            {claudeTabLabel}
          </button>
        </div>

        {/* Command list */}
        <div className="slash-command-list">
          {filteredCommands.length === 0 ? (
            <div className="slash-command-empty">
              {query ? 'No matching commands' : 'No commands available'}
            </div>
          ) : (
            filteredCommands.map((command, index) => (
              <MenuItem
                key={command.name}
                label={`/${command.name}${command.argumentHint ? ` ${command.argumentHint}` : ''}`}
                description={command.description}
                onClick={() => {
                  onSelectCommand(command, activeTab)
                  onClose()
                }}
                selected={index === selectedIndex}
              />
            ))
          )}
        </div>

        {/* Keyboard hint */}
        <div className="slash-command-hint">
          <span>Tab: switch tabs</span>
          <span>↑↓: navigate</span>
          <span>Enter: execute</span>
          <span>Esc: close</span>
        </div>
      </div>
    )
  }
)

SlashCommandMenu.displayName = 'SlashCommandMenu'
