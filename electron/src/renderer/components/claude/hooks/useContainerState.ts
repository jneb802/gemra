import { useReducer, useMemo } from 'react'
import type { ContainerStatus } from '../../../../shared/types'

/**
 * Reducer hook for managing Docker container lifecycle state
 * Handles container status transitions and error states
 */

interface ContainerState {
  containerStatus: ContainerStatus
  containerError: string | undefined
  isTogglingContainer: boolean
}

type ContainerAction =
  | { type: 'SET_STATUS'; payload: ContainerStatus }
  | { type: 'SET_ERROR'; payload: string | undefined }
  | { type: 'START_TOGGLE' }
  | { type: 'FINISH_TOGGLE' }
  | { type: 'UPDATE'; payload: { status?: ContainerStatus; error?: string } }

const initialState: ContainerState = {
  containerStatus: 'disabled',
  containerError: undefined,
  isTogglingContainer: false
}

function containerReducer(state: ContainerState, action: ContainerAction): ContainerState {
  switch (action.type) {
    case 'SET_STATUS':
      return {
        ...state,
        containerStatus: action.payload
      }

    case 'SET_ERROR':
      return {
        ...state,
        containerError: action.payload
      }

    case 'START_TOGGLE':
      return {
        ...state,
        isTogglingContainer: true
      }

    case 'FINISH_TOGGLE':
      return {
        ...state,
        isTogglingContainer: false
      }

    case 'UPDATE': {
      const { status, error } = action.payload
      return {
        ...state,
        ...(status !== undefined && { containerStatus: status }),
        ...(error !== undefined && { containerError: error })
      }
    }

    default:
      return state
  }
}

export function useContainerState() {
  const [state, dispatch] = useReducer(containerReducer, initialState)

  // Memoized actions for stable references
  const actions = useMemo(
    () => ({
      setStatus: (status: ContainerStatus) =>
        dispatch({ type: 'SET_STATUS', payload: status }),
      setError: (error: string | undefined) => dispatch({ type: 'SET_ERROR', payload: error }),
      startToggle: () => dispatch({ type: 'START_TOGGLE' }),
      finishToggle: () => dispatch({ type: 'FINISH_TOGGLE' }),
      update: (status?: ContainerStatus, error?: string) =>
        dispatch({ type: 'UPDATE', payload: { status, error } })
    }),
    []
  )

  return { state, actions }
}
