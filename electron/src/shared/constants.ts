/**
 * Application-wide constants
 */

/**
 * Timing constants (in milliseconds)
 */
export const TIMING = {
  /** Delay before processing queued messages to ensure clean state */
  MESSAGE_QUEUE_DELAY: 100,

  /** Delay before restarting agent to ensure cleanup */
  AGENT_RESTART_DELAY: 500,

  /** Interval for polling git stats */
  GIT_STATS_POLL_INTERVAL: 2000,

  /** Live timer update interval for elapsed time display */
  TIMER_UPDATE_INTERVAL: 1000,

  /** Delay for terminal initialization before spawning PTY */
  TERMINAL_INIT_DELAY: 100,
} as const
