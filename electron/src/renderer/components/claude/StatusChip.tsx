import React from 'react'
import { Tooltip } from '../common/Tooltip'

interface StatusChipProps {
  icon?: string
  text: string
  onClick?: () => void
  title?: string
}

export const StatusChip: React.FC<StatusChipProps> = ({ icon, text, onClick, title }) => {
  const isClickable = !!onClick

  const chip = (
    <div
      onClick={onClick}
      className={`status-chip ${isClickable ? 'clickable' : ''}`}
    >
      {icon && <span className="status-chip-icon">{icon}</span>}
      <span>{text}</span>
    </div>
  )

  if (title) {
    return <Tooltip content={title}>{chip}</Tooltip>
  }

  return chip
}
