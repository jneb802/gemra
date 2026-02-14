/**
 * Custom hook for platform detection and modifier key handling
 */
export function usePlatform() {
  const isMac = window.electron.platform === 'darwin'
  const isWindows = window.electron.platform === 'win32'
  const isLinux = window.electron.platform === 'linux'

  /**
   * Get the command/control modifier key from a keyboard event
   */
  const getModifierKey = (e: KeyboardEvent): boolean => {
    return isMac ? e.metaKey : e.ctrlKey
  }

  return {
    isMac,
    isWindows,
    isLinux,
    getModifierKey,
  }
}
