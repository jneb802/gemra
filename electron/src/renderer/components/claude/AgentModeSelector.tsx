import React from 'react'
import { OptionSelector, type Option } from '../common'

type AgentMode = 'default' | 'acceptEdits' | 'plan'

interface AgentModeSelectorProps {
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
  disabled?: boolean
}

const MODE_OPTIONS: Option[] = [
  { id: 'default', name: 'Default', description: 'Standard behavior' },
  { id: 'acceptEdits', name: 'Accept Edits', description: 'Auto-accept edits' },
  { id: 'plan', name: 'Plan', description: 'Planning only' },
]

export const AgentModeSelector: React.FC<AgentModeSelectorProps> = ({
  mode,
  onModeChange,
  disabled = false,
}) => {
  return (
    <OptionSelector
      value={mode}
      options={MODE_OPTIONS}
      onChange={onModeChange}
      label="Agent mode"
      tooltipTemplate={(option) =>
        `Agent mode: ${option.name}\n${option.description}\nClick to change agent behavior`
      }
      align="left"
      disabled={disabled}
    />
  )
}
