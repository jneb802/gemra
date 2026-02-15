import React from 'react'

interface SeparatorProps {
  orientation?: 'vertical' | 'horizontal'
  color?: string
  size?: string
}

export function Separator({
  orientation = 'vertical',
  color = '#3e3e3e',
  size = '16px',
}: SeparatorProps) {
  return (
    <div
      style={{
        width: orientation === 'vertical' ? '1px' : '100%',
        height: orientation === 'vertical' ? size : '1px',
        backgroundColor: color,
      }}
    />
  )
}
