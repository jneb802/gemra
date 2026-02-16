import React from 'react'
import type { ContainerStatus } from '../../../shared/types'

interface ContainerStatusChipProps {
  status: ContainerStatus
  error?: string
  onClick: () => void
}

export const ContainerStatusChip: React.FC<ContainerStatusChipProps> = ({
  status,
  error,
  onClick,
}) => {
  const getLabel = () => {
    switch (status) {
      case 'disabled':
        return 'Container: Off'
      case 'building':
        return 'Container: Building...'
      case 'starting':
        return 'Container: Starting...'
      case 'running':
        return 'Container: Running'
      case 'error':
        // Extract key phrase for compact display
        if (error) {
          if (error.includes('not running')) {
            return 'Container: Start Docker'
          } else if (error.includes('not installed')) {
            return 'Container: Install Docker'
          } else if (error.includes('OrbStack')) {
            return 'Container: Start OrbStack'
          } else if (error.includes('Docker Desktop')) {
            return 'Container: Start Docker Desktop'
          }
        }
        return 'Container: Error'
      default:
        return 'Container: Unknown'
    }
  }

  const getColor = () => {
    switch (status) {
      case 'disabled':
        return '#888'
      case 'building':
      case 'starting':
        return '#f59e0b' // Orange
      case 'running':
        return '#4ade80' // Green
      case 'error':
        return '#f87171' // Red
      default:
        return '#888'
    }
  }

  const isClickable = () => {
    // Allow clicking on error state to retry
    return status === 'disabled' || status === 'running' || status === 'error'
  }

  return (
    <div
      onClick={isClickable() ? onClick : undefined}
      title={error || `Click to toggle container mode`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        backgroundColor: '#2a2a2a',
        border: '1px solid #3a3a3a',
        borderRadius: '6px',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        color: getColor(),
        cursor: isClickable() ? 'pointer' : 'default',
        opacity: isClickable() ? 1 : 0.6,
        transition: 'background-color 0.15s ease',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (isClickable()) {
          e.currentTarget.style.backgroundColor = '#3a3a3a'
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable()) {
          e.currentTarget.style.backgroundColor = '#2a2a2a'
        }
      }}
    >
      {/* Status indicator */}
      {status === 'running' && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: getColor(),
            flexShrink: 0,
          }}
        />
      )}
      {(status === 'building' || status === 'starting') && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            border: '1.5px solid currentColor',
            borderTopColor: 'transparent',
            animation: 'spin 1s linear infinite',
            flexShrink: 0,
          }}
        />
      )}
      {status === 'error' && <span style={{ fontSize: '10px' }}>✕</span>}

      <span>{getLabel()}</span>
    </div>
  )
}
