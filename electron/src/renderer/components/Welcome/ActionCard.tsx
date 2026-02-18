import React from 'react'

interface ActionCardProps {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}

export const ActionCard: React.FC<ActionCardProps> = ({ icon, title, description, onClick }) => {
  return (
    <button className="action-card" onClick={onClick}>
      <div className="action-card__icon">
        {icon}
      </div>
      <div className="action-card__body">
        <h3 className="action-card__title">{title}</h3>
        <p className="action-card__description">{description}</p>
      </div>
    </button>
  )
}
