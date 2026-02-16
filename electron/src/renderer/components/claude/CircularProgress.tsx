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
      className="circular-progress"
    >
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="circular-progress-bg"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="circular-progress-bar"
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  )
}
