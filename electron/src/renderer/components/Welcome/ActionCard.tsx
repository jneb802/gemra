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
        backgroundColor: '#2d2d2d',
        border: '1px solid #3e3e3e',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        color: '#d4d4d4',
        outline: 'none'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#569cd6'
        e.currentTarget.style.backgroundColor = '#333333'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#3e3e3e'
        e.currentTarget.style.backgroundColor = '#2d2d2d'
      }}
    >
      <div style={{ fontSize: '32px', color: '#569cd6' }}>
        {icon}
      </div>
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>
          {title}
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: '#8e8e8e' }}>
          {description}
        </p>
      </div>
    </button>
  )
}
