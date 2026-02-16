import React from 'react'

interface BashIconProps {
  size?: number
  color?: string
}

export const BashIcon: React.FC<BashIconProps> = ({ size = 16, color = 'currentColor' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Terminal prompt ">" */}
      <path
        d="M8 6L14 12L8 18"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Underscore "_" */}
      <path
        d="M14 18H20"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
