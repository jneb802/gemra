import React from 'react'
import { useHoverStyle } from '../../hooks/useHoverStyle'

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
  const hoverProps = useHoverStyle('#3e3e3e', selected ? '#3e3e3e' : 'transparent')

  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: description ? '8px 12px' : '6px 12px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        color: '#d4d4d4',
        fontSize: '13px',
        backgroundColor: selected ? '#3e3e3e' : 'transparent',
        transition: 'background-color 0.15s ease',
      }}
      {...(!disabled && hoverProps)}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: description ? 500 : 400 }}>{label}</div>
        {description && (
          <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
            {description}
          </div>
        )}
      </div>
      {shortcut && (
        <span style={{ fontSize: '11px', color: '#808080', marginLeft: '24px' }}>
          {shortcut}
        </span>
      )}
    </div>
  )
}
