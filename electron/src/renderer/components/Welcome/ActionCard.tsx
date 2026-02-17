import React from 'react'

interface ActionCardProps {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}

export const ActionCard: React.FC<ActionCardProps> = ({ icon, title, description, onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '16px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        color: 'var(--text-primary)',
        outline: 'none'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-color-focus)'
        e.currentTarget.style.backgroundColor = 'var(--bg-active)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-color)'
        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
      }}
    >
      <div style={{ fontSize: '32px', color: 'var(--button-primary)' }}>
        {icon}
      </div>
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>
          {title}
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
          {description}
        </p>
      </div>
    </button>
  )
}
