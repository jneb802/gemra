import React, { useState, useRef, useEffect } from 'react'
import { MenuItem } from './MenuItem'
import { useHoverStyle } from '../../hooks/useHoverStyle'

export interface DropdownOption<T extends string> {
  id: T
  label: string
  description: string
}

interface DropdownMenuProps<T extends string> {
  label: string
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  getLabel?: (value: T) => string
}

export function DropdownMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  getLabel,
}: DropdownMenuProps<T>) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const hoverProps = useHoverStyle()

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const displayLabel = getLabel ? getLabel(value) : options.find(o => o.id === value)?.label || value

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ color: '#666' }}>{label}:</span>
      <button
        onClick={() => setShowMenu(!showMenu)}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#b0b0b0',
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          transition: 'background-color 0.15s ease',
        }}
        {...hoverProps}
      >
        {displayLabel} ▾
      </button>

      {showMenu && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '0',
            marginBottom: '8px',
            backgroundColor: '#2d2d2d',
            border: '1px solid #3e3e3e',
            borderRadius: '4px',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            minWidth: '200px',
            zIndex: 1000,
          }}
        >
          {options.map((option) => (
            <MenuItem
              key={option.id}
              label={option.label}
              description={option.description}
              onClick={() => {
                onChange(option.id)
                setShowMenu(false)
              }}
              selected={value === option.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
