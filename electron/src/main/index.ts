import { app, BrowserWindow } from 'electron'
import { WindowManager } from './WindowManager'
import { PtyManager } from './PtyManager'
import { MenuBuilder } from './menu/MenuBuilder'
import { setupTerminalIpc } from './ipc/terminal'
import { setupClaudeIpc, cleanupClaudeAgents } from './ipc/claude'

// Handle creating/removing shortcuts on Windows when installing/uninstalling
try {
  if (require('electron-squirrel-startup')) {
    app.quit()
  }
} catch {
  // electron-squirrel-startup is optional
}

let windowManager: WindowManager
let ptyManager: PtyManager

// Create main window
const createWindow = () => {
  windowManager = new WindowManager()
  ptyManager = new PtyManager()

  const mainWindow = windowManager.createMainWindow()

  // Setup IPC handlers
  setupTerminalIpc(ptyManager, mainWindow)
  setupClaudeIpc(mainWindow)

  // Setup menu
  const menuBuilder = new MenuBuilder(mainWindow)
  menuBuilder.setupMenu()
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow()

  // On macOS, re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Clean up PTYs and Claude agents before quit
app.on('before-quit', async () => {
  if (ptyManager) {
    ptyManager.killAll()
  }
  await cleanupClaudeAgents()
})
