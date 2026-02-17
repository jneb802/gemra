import { app, Menu, BrowserWindow, MenuItemConstructorOptions } from 'electron'

export class MenuBuilder {
  private mainWindow: BrowserWindow

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  buildMenu(): Menu {
    const template = this.buildTemplate()
    const menu = Menu.buildFromTemplate(template)
    return menu
  }

  private buildTemplate(): MenuItemConstructorOptions[] {
    const isMac = process.platform === 'darwin'

    const template: MenuItemConstructorOptions[] = [
      // App menu (macOS only)
      ...(isMac
        ? [
            {
              label: app.name,
              submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                {
                  label: 'Preferences...',
                  accelerator: 'Cmd+,',
                  click: () => {
                    this.mainWindow.webContents.send('menu:preferences')
                  },
                },
                { type: 'separator' as const },
                { role: 'services' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            },
          ]
        : []),

      // Shell menu
      {
        label: 'Shell',
        submenu: [
          {
            label: 'New Terminal Tab',
            accelerator: 'CmdOrCtrl+Shift+T',
            click: () => {
              this.mainWindow.webContents.send('menu:new-terminal')
            },
          },
          {
            label: 'New LiteLLM Chat',
            accelerator: 'CmdOrCtrl+Shift+L',
            click: () => {
              this.mainWindow.webContents.send('menu:new-litellm-chat')
            },
          },
          { type: 'separator' },
          {
            label: 'Select Previous Tab',
            accelerator: 'CmdOrCtrl+Shift+[',
            click: () => {
              this.mainWindow.webContents.send('menu:previous-tab')
            },
          },
          {
            label: 'Select Next Tab',
            accelerator: 'CmdOrCtrl+Shift+]',
            click: () => {
              this.mainWindow.webContents.send('menu:next-tab')
            },
          },
        ],
      },

      // Edit menu
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          ...(isMac
            ? [
                { role: 'pasteAndMatchStyle' as const },
                { role: 'delete' as const },
                { role: 'selectAll' as const },
              ]
            : [
                { role: 'delete' as const },
                { type: 'separator' as const },
                { role: 'selectAll' as const },
              ]),
        ],
      },

      // View menu
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          {
            label: 'Show Debug Console',
            accelerator: 'F12',
            click: () => {
              this.mainWindow.webContents.toggleDevTools()
            },
          },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },

      // Window menu
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          ...(isMac
            ? [
                { type: 'separator' as const },
                { role: 'front' as const },
                { type: 'separator' as const },
                { role: 'window' as const },
              ]
            : [{ role: 'close' as const }]),
        ],
      },

      // Help menu
      {
        role: 'help',
        submenu: [
          {
            label: 'Learn More',
            click: async () => {
              const { shell } = require('electron')
              await shell.openExternal('https://github.com')
            },
          },
        ],
      },
    ]

    return template
  }

  setupMenu(): void {
    const menu = this.buildMenu()
    Menu.setApplicationMenu(menu)
  }
}
