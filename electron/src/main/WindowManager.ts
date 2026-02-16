import { BrowserWindow, shell } from 'electron'
import * as path from 'path'

export class WindowManager {
  private mainWindow: BrowserWindow | null = null

  createMainWindow(): BrowserWindow {
    // Create the browser window
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 600,
      minHeight: 400,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: '#1e1e1e',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false, // Required for node-pty
      },
    })

    // Load the app
    if (process.env.ELECTRON_RENDERER_URL) {
      // Development mode
      this.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
      // DevTools can be opened with F12 or View > Show Debug Console
    } else {
      // Production mode
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    // Open external links in browser
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url)
        return { action: 'deny' }
      }
      return { action: 'allow' }
    })

    // Handle window close
    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })

    return this.mainWindow
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  closeMainWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.close()
    }
  }
}
