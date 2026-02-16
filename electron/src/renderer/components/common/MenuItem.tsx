import React from 'react'

export interface MenuItemProps {
  label: string
  description?: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  selected?: boolean
}

export function MenuItem({
  label,
  description,
  shortcut,
  onClick,
  disabled = false,
  selected = false,
}: MenuItemProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`menu-item ${selected ? 'selected' : ''}`}
    >
      <div className="menu-item-content">
        <div className="menu-item-label">{label}</div>
        {description && (
          <div className="menu-item-description">
            {description}
          </div>
        )}
      </div>
      {shortcut && (
        <span className="menu-item-shortcut">
          {shortcut}
        </span>
      )}
    </button>
  )
}
