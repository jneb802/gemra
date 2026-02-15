/**
 * Centralized ID generation utilities
 */

let tabCounter = 0

export const generateId = {
  /**
   * Generate a unique message ID
   */
  message: (): string => {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  },

  /**
   * Generate a unique agent ID
   */
  agent: (): string => {
    return `agent-${Date.now()}`
  },

  /**
   * Generate a unique tab ID
   */
  tab: (): string => {
    return `tab-${++tabCounter}`
  },
}
