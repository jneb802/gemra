import { useState, useCallback } from 'react'
import { Toast, ToastProps } from './Toast'

interface ToastItem {
  id: string
  message: string
  type: ToastProps['type']
  duration?: number
}

let toastId = 0
let addToastCallback: ((toast: Omit<ToastItem, 'id'>) => void) | null = null

/**
 * Show a toast notification
 * Can be called from anywhere in the app
 */
export function showToast(message: string, type: ToastProps['type'] = 'success', duration?: number) {
  if (addToastCallback) {
    addToastCallback({ message, type, duration })
  }
}

/**
 * ToastContainer - Manages and displays all active toasts
 *
 * Should be rendered once at the app root level
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${toastId++}`
    setToasts((prev) => [...prev, { ...toast, id }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Register global callback
  addToastCallback = addToast

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )
}
