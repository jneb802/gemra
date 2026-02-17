import { useCallback, useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { useSettingsStore } from '../../stores/settingsStore'
import { terminalThemes } from '../../themes/terminalThemes'
import '@xterm/xterm/css/xterm.css'

interface UseTerminalOptions {
  terminalId: string
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
}

export function useTerminal({ terminalId, onData, onResize }: UseTerminalOptions) {
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const settings = useSettingsStore()

  // Initialize terminal (only when terminalId changes)
  useEffect(() => {
    if (!containerRef.current) return

    // Create terminal instance
    const terminal = new XTerm({
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      theme: terminalThemes[settings.theme],
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
      webglAddonRef.current = webglAddon
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
      webglAddonRef.current?.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      webglAddonRef.current = null
    }
  }, [terminalId]) // Only re-create when terminalId changes

  // Update terminal options when settings change (without re-creating terminal)
  useEffect(() => {
    if (!terminalRef.current) return

    terminalRef.current.options = {
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      theme: terminalThemes[settings.theme],
      scrollback: settings.scrollback,
    }

    // Re-fit after font/size changes
    fitAddonRef.current?.fit()
  }, [settings])

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

  // Write data to terminal — stable reference via useCallback so effects that
  // depend on `write` don't re-subscribe on every render
  const write = useCallback((data: string) => {
    terminalRef.current?.write(data)
  }, [])

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
