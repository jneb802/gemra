import { useState, useEffect, useCallback } from 'react'
import type { ContainerStatus } from '../../../../shared/types'
import { TIMING } from '../../../../shared/constants'
import { useContainerState } from './useContainerState'

/**
 * Hook for managing Docker container lifecycle
 * Handles container toggle, permissions check, and system messages
 */

interface UseContainerManagementOptions {
  workingDir: string
  currentAgentId: string | undefined
  useDocker: boolean
  onRestartAgent: (useDocker: boolean) => Promise<string | null>
  onAddSystemMessage: (message: string) => void
  onUpdateSettings: (settings: { useDocker: boolean }) => void
  onUpdateTabAgent: (tabId: string, agentId: string) => void
  activeTabId: string | null
}

export function useContainerManagement({
  workingDir,
  currentAgentId,
  useDocker,
  onRestartAgent,
  onAddSystemMessage,
  onUpdateSettings,
  onUpdateTabAgent,
  activeTabId
}: UseContainerManagementOptions) {
  const { state: containerState, actions: containerActions } = useContainerState()
  const [dangerouslySkipPermissions, setDangerouslySkipPermissions] = useState(false)

  // Check permissions mode on mount
  useEffect(() => {
    window.electron.claude.getPermissionsMode().then((result) => {
      setDangerouslySkipPermissions(result.dangerouslySkipPermissions)
    })
  }, [])

  // Set initial container status based on Docker mode
  useEffect(() => {
    if (useDocker) {
      containerActions.setStatus('building')
    } else {
      containerActions.setStatus('disabled')
    }
  }, [useDocker, containerActions])

  // Handle container toggle
  const handleContainerToggle = useCallback(async () => {
    console.log('[useContainerManagement] Container toggle clicked - current status:', containerState.containerStatus)

    // Prevent multiple toggles at once or when agent is working
    if (containerState.isTogglingContainer) {
      console.log('[useContainerManagement] Toggle already in progress')
      return
    }

    // Only allow toggle when disabled, running, or error (error = retry)
    if (
      containerState.containerStatus !== 'disabled' &&
      containerState.containerStatus !== 'running' &&
      containerState.containerStatus !== 'error'
    ) {
      console.log('[useContainerManagement] Cannot toggle during build/start states')
      return
    }

    containerActions.startToggle()

    try {
      // Determine new Docker state
      // If error, retry with Docker enabled (assumes user fixed the issue)
      // Otherwise, toggle the current state
      const newDockerState =
        containerState.containerStatus === 'error'
          ? true
          : containerState.containerStatus === 'disabled'
      const modeText = newDockerState ? 'container' : 'host'

      // Update settings store to persist the Docker mode
      onUpdateSettings({ useDocker: newDockerState })

      // Set container status immediately based on new mode
      if (newDockerState) {
        containerActions.setStatus('building')
      } else {
        containerActions.setStatus('disabled')
      }

      // Add system message about restart
      if (containerState.containerStatus === 'error') {
        onAddSystemMessage(`🔄 Retrying container mode...`)
      } else {
        onAddSystemMessage(`🔄 Restarting agent in ${modeText} mode...`)
      }

      // Stop current agent
      if (currentAgentId) {
        console.log('[useContainerManagement] Stopping current agent:', currentAgentId)
        await window.electron.claude.stop(currentAgentId)
      }

      // Delay before restarting agent to ensure cleanup
      await new Promise((resolve) => setTimeout(resolve, TIMING.AGENT_RESTART_DELAY))

      // Restart agent with toggled Docker state
      const newAgentId = await onRestartAgent(newDockerState)

      if (newAgentId) {
        console.log('[useContainerManagement] New agent started:', newAgentId)

        // Update the tab's agent ID in store
        if (activeTabId) {
          onUpdateTabAgent(activeTabId, newAgentId)
        }

        // Add success message
        onAddSystemMessage(`✓ Agent restarted in ${modeText} mode`)

        // Ensure container status reflects the new mode
        // The status will be updated by IPC events as the agent progresses
        if (!newDockerState) {
          // For non-Docker mode, immediately set to disabled
          containerActions.setStatus('disabled')
        }
        // For Docker mode, status was already set to 'building' above
      } else {
        console.error('[useContainerManagement] Failed to start new agent')
        onAddSystemMessage(`✗ Failed to restart agent`)
        containerActions.setStatus('error')
        containerActions.setError('Failed to start agent')
      }
    } catch (error) {
      console.error('[useContainerManagement] Container toggle error:', error)
      onAddSystemMessage(
        `✗ Error toggling container: ${error instanceof Error ? error.message : String(error)}`
      )
      containerActions.setStatus('error')
      containerActions.setError(error instanceof Error ? error.message : String(error))
    } finally {
      containerActions.finishToggle()
    }
  }, [
    containerState.containerStatus,
    containerState.isTogglingContainer,
    currentAgentId,
    activeTabId,
    containerActions,
    onRestartAgent,
    onAddSystemMessage,
    onUpdateSettings,
    onUpdateTabAgent
  ])

  return {
    // State
    containerStatus: containerState.containerStatus,
    containerError: containerState.containerError,
    isTogglingContainer: containerState.isTogglingContainer,
    dangerouslySkipPermissions,

    // Actions
    handleContainerToggle,
    setContainerStatus: containerActions.setStatus,
    setContainerError: containerActions.setError
  }
}
