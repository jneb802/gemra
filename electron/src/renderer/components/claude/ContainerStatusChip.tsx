import React from 'react'
import { Tooltip } from '../common/Tooltip'
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
        return 'var(--text-muted)'
      case 'building':
      case 'starting':
        return 'var(--container-building)'
      case 'running':
        return 'var(--container-running)'
      case 'error':
        return 'var(--container-error)'
      default:
        return 'var(--text-muted)'
    }
  }

  const isClickable = () => {
    // Allow clicking on error state to retry
    return status === 'disabled' || status === 'running' || status === 'error'
  }

  const chip = (
    <div
      onClick={isClickable() ? onClick : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        backgroundColor: 'var(--bg-user-message)',
        border: '1px solid var(--bg-active)',
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
          e.currentTarget.style.backgroundColor = 'var(--bg-active)'
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable()) {
          e.currentTarget.style.backgroundColor = 'var(--bg-user-message)'
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

  const tooltipContent = error || 'Click to toggle container mode'
  return <Tooltip content={tooltipContent}>{chip}</Tooltip>
}
