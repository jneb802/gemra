import React, { useState, useRef, useEffect } from 'react'
import { MenuItem } from './MenuItem'

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
    <div ref={menuRef} className="dropdown-menu-container">
      <span className="status-bar-label">{label}:</span>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="dropdown-menu-trigger"
      >
        {displayLabel} ▾
      </button>

      {showMenu && (
        <div className="dropdown-menu-popup">
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
