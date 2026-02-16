import React from 'react'

interface SeparatorProps {
  orientation?: 'vertical' | 'horizontal'
}

export function Separator({ orientation = 'vertical' }: SeparatorProps) {
  return (
    <div
      className="separator"
      style={{
        width: orientation === 'vertical' ? undefined : '100%',
        height: orientation === 'vertical' ? undefined : '1px',
      }}
    />
  )
}
