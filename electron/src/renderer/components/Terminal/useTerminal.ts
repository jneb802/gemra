import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { useSettingsStore } from '../../stores/settingsStore'
import '@xterm/xterm/css/xterm.css'

interface UseTerminalOptions {
  terminalId: string
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
}

export function useTerminal({ terminalId, onData, onResize }: UseTerminalOptions) {
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const settings = useSettingsStore()

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return

    // Create terminal instance
    const terminal = new XTerm({
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      theme:
        settings.theme === 'dark'
          ? {
              background: '#1e1e1e',
              foreground: '#d4d4d4',
              cursor: '#d4d4d4',
              cursorAccent: '#1e1e1e',
              selectionBackground: 'rgba(255, 255, 255, 0.3)',
              black: '#000000',
              red: '#cd3131',
              green: '#0dbc79',
              yellow: '#e5e510',
              blue: '#2472c8',
              magenta: '#bc3fbc',
              cyan: '#11a8cd',
              white: '#e5e5e5',
              brightBlack: '#666666',
              brightRed: '#f14c4c',
              brightGreen: '#23d18b',
              brightYellow: '#f5f543',
              brightBlue: '#3b8eea',
              brightMagenta: '#d670d6',
              brightCyan: '#29b8db',
              brightWhite: '#ffffff',
            }
          : {
              background: '#ffffff',
              foreground: '#383a42',
              cursor: '#383a42',
              cursorAccent: '#ffffff',
              selectionBackground: 'rgba(0, 0, 0, 0.3)',
              black: '#000000',
              red: '#e45649',
              green: '#50a14f',
              yellow: '#c18401',
              blue: '#0184bc',
              magenta: '#a626a4',
              cyan: '#0997b3',
              white: '#fafafa',
              brightBlack: '#a0a1a7',
              brightRed: '#e45649',
              brightGreen: '#50a14f',
              brightYellow: '#c18401',
              brightBlue: '#0184bc',
              brightMagenta: '#a626a4',
              brightCyan: '#0997b3',
              brightWhite: '#ffffff',
            },
      scrollback: settings.scrollback,
      allowProposedApi: true,
    })

    // Create fit addon
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    // Open terminal in container
    terminal.open(containerRef.current)

    // Load WebGL addon for better performance
    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        webglAddon.dispose()
      })
      terminal.loadAddon(webglAddon)
    } catch (e) {
      console.warn('WebGL addon failed to load:', e)
    }

    // Fit terminal to container
    fitAddon.fit()

    // Store references
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Handle terminal data (user input)
    if (onData) {
      terminal.onData(onData)
    }

    // Handle resize
    if (onResize) {
      terminal.onResize(({ cols, rows }) => {
        onResize(cols, rows)
      })
    }

    // Initial resize notification
    if (onResize) {
      onResize(terminal.cols, terminal.rows)
    }

    // Cleanup
    return () => {
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [terminalId, settings]) // Re-initialize if settings change

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Write data to terminal
  const write = (data: string) => {
    terminalRef.current?.write(data)
  }

  // Focus terminal
  const focus = () => {
    terminalRef.current?.focus()
  }

  // Fit terminal to container
  const fit = () => {
    fitAddonRef.current?.fit()
  }

  // Copy selected text to clipboard
  const copySelection = async () => {
    const selection = terminalRef.current?.getSelection()
    if (selection) {
      try {
        await navigator.clipboard.writeText(selection)
      } catch (err) {
        console.error('Failed to copy:', err)
      }
    }
  }

  // Paste from clipboard
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      terminalRef.current?.paste(text)
    } catch (err) {
      console.error('Failed to paste:', err)
    }
  }

  // Select all terminal content
  const selectAll = () => {
    terminalRef.current?.selectAll()
  }

  // Clear selection
  const clearSelection = () => {
    terminalRef.current?.clearSelection()
  }

  return {
    containerRef,
    terminal: terminalRef.current,
    write,
    focus,
    fit,
    copySelection,
    paste,
    selectAll,
    clearSelection,
  }
}
