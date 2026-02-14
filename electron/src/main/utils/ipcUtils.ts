import { ipcMain } from 'electron'

/**
 * Higher-order function to create IPC handlers with consistent error handling
 */
export function createIpcHandler<T extends any[], R extends Record<string, any>>(
  channel: string,
  handler: (...args: T) => Promise<R> | R
): void {
  ipcMain.handle(channel, async (_, ...args: T) => {
    try {
      const result = await handler(...(args as T))
      return { success: true, ...result }
    } catch (error: any) {
      console.error(`[${channel}] Error:`, error)
      return { success: false, error: String(error?.message || error) }
    }
  })
}
