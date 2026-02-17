import { ipcMain } from 'electron'
import { shellIntegration } from '../ShellIntegration'

export function registerShellIntegrationHandlers() {
  // Get integration status
  ipcMain.handle('shell-integration:get-status', async () => {
    return shellIntegration.getStatus()
  })

  // Enable integration
  ipcMain.handle('shell-integration:enable', async () => {
    const shell = shellIntegration.detectShell()
    if (shell === 'unknown') {
      return { success: false, error: 'Unknown shell' }
    }
    return shellIntegration.enableIntegration(shell)
  })

  // Disable integration
  ipcMain.handle('shell-integration:disable', async () => {
    const shell = shellIntegration.detectShell()
    if (shell === 'unknown') {
      return { success: false, error: 'Unknown shell' }
    }
    return shellIntegration.disableIntegration(shell)
  })

  // Install scripts only
  ipcMain.handle('shell-integration:install-scripts', async () => {
    try {
      await shellIntegration.installScripts()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })
}
