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
}

export interface SlashCommandMenuHandle {
  toggleTab: () => void
  navigate: (direction: number) => void
  executeSelected: () => void
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
  ({ query, customCommands, claudeCommands, onSelectCommand, onClose }, ref) => {
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
      <div
        style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          right: 0,
          marginBottom: '8px',
          backgroundColor: '#2d2d2d',
          border: '1px solid #3e3e3e',
          borderRadius: '4px',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
          maxHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
        }}
      >
        {/* Tab header */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #3e3e3e',
            padding: '8px 12px',
            gap: '16px',
          }}
        >
          <button
            onClick={() => {
              setActiveTab('custom')
              setSelectedIndex(0)
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: activeTab === 'custom' ? '#d4d4d4' : '#808080',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: '12px',
              fontWeight: 500,
              borderBottom: activeTab === 'custom' ? '2px solid #4ade80' : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            Custom Commands
          </button>
          <button
            onClick={() => {
              setActiveTab('claude')
              setSelectedIndex(0)
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: activeTab === 'claude' ? '#d4d4d4' : '#808080',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: '12px',
              fontWeight: 500,
              borderBottom: activeTab === 'claude' ? '2px solid #4ade80' : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            Claude Commands
          </button>
        </div>

        {/* Command list */}
        <div style={{ overflowY: 'auto', maxHeight: '350px' }}>
          {filteredCommands.length === 0 ? (
            <div
              style={{
                padding: '16px',
                color: '#808080',
                fontSize: '13px',
                textAlign: 'center',
              }}
            >
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
        <div
          style={{
            borderTop: '1px solid #3e3e3e',
            padding: '6px 12px',
            fontSize: '11px',
            color: '#666',
            display: 'flex',
            gap: '12px',
          }}
        >
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
