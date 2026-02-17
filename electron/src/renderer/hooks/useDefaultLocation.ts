import { useState } from 'react'

/**
 * Hook to get platform-specific default directory location
 */
export function useDefaultLocation(): [string, (value: string) => void] {
  const getDefaultLocation = (): string => {
    const platform = window.electron.platform

    if (platform === 'darwin') {
      return '/Users'
    } else if (platform === 'win32') {
      return 'C:\\'
    } else {
      return '/home'
    }
  }

  const [location, setLocation] = useState(getDefaultLocation())

  return [location, setLocation]
}
