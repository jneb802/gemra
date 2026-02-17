import { useEffect, useRef } from 'react'
import type { MessageMetadata } from '../../../../shared/types'
import { TIMING } from '../../../../shared/constants'

/**
 * Hook for managing message metadata (timing, token usage)
 * Handles live timer updates for in-progress turns
 */

interface UseMessageMetadataOptions {
  isWorking: boolean
  currentTurnMetadata: MessageMetadata | null
  onMetadataUpdate: (metadata: MessageMetadata | null) => void
}

export function useMessageMetadata({
  isWorking,
  currentTurnMetadata,
  onMetadataUpdate
}: UseMessageMetadataOptions) {
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Live timer effect for elapsed time updates
  useEffect(() => {
    // Clear any existing interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    // Only run timer if metadata exists and is not complete
    if (!currentTurnMetadata || currentTurnMetadata.isComplete) {
      return
    }

    // Start new interval for live updates
    timerIntervalRef.current = setInterval(() => {
      // Trigger re-render to update elapsed time display by creating new reference
      onMetadataUpdate({ ...currentTurnMetadata })
    }, TIMING.TIMER_UPDATE_INTERVAL)

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
    }
  }, [currentTurnMetadata?.isComplete, onMetadataUpdate])

  return {
    // Helper to calculate current elapsed time for a phase
    getCurrentPhaseElapsed: (metadata: MessageMetadata): number => {
      if (!metadata || metadata.isComplete) return 0
      return Date.now() - (metadata.phaseStartTime || metadata.startTime || Date.now())
    },

    // Helper to get total elapsed time
    getTotalElapsed: (metadata: MessageMetadata): number => {
      if (!metadata) return 0
      if (metadata.isComplete && metadata.totalDuration) {
        return metadata.totalDuration
      }
      return Date.now() - (metadata.startTime || Date.now())
    }
  }
}
