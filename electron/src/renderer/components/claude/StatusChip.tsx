import React from 'react'

interface StatusChipProps {
  icon?: string
  text: string
  onClick?: () => void
  title?: string
}

export const StatusChip: React.FC<StatusChipProps> = ({ icon, text, onClick, title }) => {
  const isClickable = !!onClick

  return (
    <div
      onClick={onClick}
      title={title}
      className={`status-chip ${isClickable ? 'clickable' : ''}`}
    >
      {icon && <span className="status-chip-icon">{icon}</span>}
      <span>{text}</span>
    </div>
  )
}
