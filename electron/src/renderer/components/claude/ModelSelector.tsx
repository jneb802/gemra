import React from 'react'
import { OptionSelector, type Option } from '../common'

interface ModelSelectorProps {
  model: string
  onModelChange: (model: string) => void
  disabled?: boolean
}

const MODEL_OPTIONS: Option[] = [
  { id: 'opus', name: 'Opus 4.6', description: 'Most capable, slower' },
  { id: 'sonnet', name: 'Sonnet 4.5', description: 'Balanced speed & quality' },
  { id: 'haiku', name: 'Haiku 4.5', description: 'Fastest, most efficient' },
]

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  model,
  onModelChange,
  disabled = false,
}) => {
  return (
    <OptionSelector
      value={model}
      options={MODEL_OPTIONS}
      onChange={onModelChange}
      label="Model"
      align="right"
      disabled={disabled}
    />
  )
}
