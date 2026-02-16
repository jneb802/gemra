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
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        backgroundColor: '#2a2a2a',
        border: '1px solid #3a3a3a',
        borderRadius: '6px',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        color: '#d4d4d4',
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.currentTarget.style.backgroundColor = '#3a3a3a'
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          e.currentTarget.style.backgroundColor = '#2a2a2a'
        }
      }}
    >
      {icon && <span style={{ fontSize: '14px', lineHeight: 1 }}>{icon}</span>}
      <span>{text}</span>
    </div>
  )
}
