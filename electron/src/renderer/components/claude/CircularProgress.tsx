import React from 'react'

interface CircularProgressProps {
  percentage: number
  size?: number
}

export const CircularProgress: React.FC<CircularProgressProps> = ({ percentage, size = 20 }) => {
  // Determine color based on percentage
  const getColor = () => {
    if (percentage >= 95) return '#f87171' // Red
    if (percentage >= 80) return '#fbbf24' // Yellow
    return '#569cd6' // Blue
  }

  const color = getColor()
  const radius = (size - 4) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference

  return (
    <svg
      width={size}
      height={size}
      style={{
        transform: 'rotate(-90deg)',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#3e3e3e"
        strokeWidth="2"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{
          transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease',
        }}
      />
    </svg>
  )
}
