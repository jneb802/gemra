import { useCallback } from 'react'

interface UseModalKeyboardOptions {
  onEnter?: () => void
  onEscape?: () => void
  canSubmit?: boolean
}

/**
 * Hook to handle common modal keyboard interactions
 */
export function useModalKeyboard({
  onEnter,
  onEscape,
  canSubmit = true,
}: UseModalKeyboardOptions) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && canSubmit && onEnter) {
        onEnter()
      } else if (e.key === 'Escape' && onEscape) {
        onEscape()
      }
    },
    [onEnter, onEscape, canSubmit]
  )

  return handleKeyDown
}
