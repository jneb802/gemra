import React from 'react'

interface GemIconProps {
  size?: number
  color?: string
}

export const GemIcon: React.FC<GemIconProps> = ({ size = 16, color = 'currentColor' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Gem shape */}
      <path
        d="M12 2L4 8L12 22L20 8L12 2Z"
        fill={color}
        fillOpacity="0.2"
      />
      <path
        d="M12 2L4 8L12 22L20 8L12 2Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner facets */}
      <path
        d="M12 2L12 22M4 8L20 8M7 5L12 8M17 5L12 8M8 8L12 12M16 8L12 12"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
    </svg>
  )
}
