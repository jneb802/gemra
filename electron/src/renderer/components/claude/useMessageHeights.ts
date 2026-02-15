import { useCallback } from 'react'
import type { ClaudeMessage } from '../../../shared/types'

// Helper to estimate height based on content length
export const estimateMessageHeight = (message: ClaudeMessage, isGrouped: boolean): number => {
  const charsPerLine = 70 // Based on CSS --message-max-width: 70ch
  const lineHeight = 24 // 16px font × 1.5 line-height
  const paddingVertical = 40 // Approximate padding (20px × 2)
  const spacing = isGrouped ? 8 : 28 // --message-spacing-grouped vs --message-spacing-default

  // Estimate number of lines
  const estimatedLines = Math.ceil(message.content.length / charsPerLine)
  const contentHeight = estimatedLines * lineHeight

  return contentHeight + paddingVertical + spacing
}

export const useMessageGrouping = (messages: ClaudeMessage[]) => {
  // Helper to check if message is grouped with previous
  const isGroupedWithPrevious = useCallback(
    (index: number): boolean => {
      if (index === 0) return false
      return messages[index].role === messages[index - 1].role
    },
    [messages]
  )

  return { isGroupedWithPrevious }
}

export const useMessageHeights = (messages: ClaudeMessage[]) => {
  const heights = new Map<number, number>()

  const getItemSize = useCallback(
    (index: number): number => {
      const cached = heights.get(index)
      if (cached) return cached

      const isGrouped = index > 0 && messages[index].role === messages[index - 1].role
      return estimateMessageHeight(messages[index], isGrouped)
    },
    [messages]
  )

  const setItemHeight = useCallback((index: number, height: number) => {
    heights.set(index, height)
  }, [])

  const resetAfterIndex = useCallback((_index: number) => {
    // Reset heights cache after index
    heights.clear()
  }, [])

  return { getItemSize, setItemHeight, resetAfterIndex }
}
