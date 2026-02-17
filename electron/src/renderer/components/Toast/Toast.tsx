import { useEffect } from 'react'

export interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
  onClose: () => void
}

/**
 * Toast - Simple toast notification component
 *
 * Displays temporary notification messages that auto-dismiss
 */
export function Toast({ message, type = 'success', duration = 2000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div className={`toast toast-${type}`}>
      <div className="toast-content">
        {type === 'success' && <span className="toast-icon">✓</span>}
        {type === 'error' && <span className="toast-icon">✕</span>}
        {type === 'info' && <span className="toast-icon">ℹ</span>}
        <span className="toast-message">{message}</span>
      </div>
    </div>
  )
}
