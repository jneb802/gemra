import React from 'react'

/**
 * Reusable hover effect hook for consistent hover styling
 */
export function useHoverStyle(
  hoverColor: string = '#3e3e3e',
  defaultColor: string = 'transparent'
) {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      e.currentTarget.style.backgroundColor = hoverColor
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      e.currentTarget.style.backgroundColor = defaultColor
    },
  }
}
