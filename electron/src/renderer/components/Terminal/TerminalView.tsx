import { useEffect, useState, useCallback } from 'react'
import { useTerminal } from './useTerminal'

interface TerminalViewProps {
  terminalId: string
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
}

export function TerminalView({ terminalId }: TerminalViewProps) {
  const { containerRef, write, focus, fit, copySelection, paste, selectAll, terminal } = useTerminal({
    terminalId,
    onData: (data) => {
      // Send user input to PTY
      window.electron.pty.write(terminalId, data)
    },
    onResize: (cols, rows) => {
      // Notify PTY of terminal resize
      window.electron.pty.resize({ terminalId, cols, rows })
    },
  })

  // Handle PTY data
  useEffect(() => {
    const unsubscribe = window.electron.pty.onData((data) => {
      if (data.terminalId === terminalId) {
        write(data.data)
      }
    })

    return unsubscribe
  }, [terminalId, write])

  // Handle PTY exit
  useEffect(() => {
    const unsubscribe = window.electron.pty.onExit((data) => {
      if (data.terminalId === terminalId) {
        write('\r\n[Process completed]\r\n')
      }
    })

    return unsubscribe
  }, [terminalId, write])

  // Spawn PTY on mount
  useEffect(() => {
    const spawnPty = async () => {
      // Wait for terminal to be initialized
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Get terminal dimensions
      const container = containerRef.current
      if (!container) return

      // Spawn PTY
      const result = await window.electron.pty.spawn(terminalId, {
        cols: 80, // Will be updated after fit
        rows: 24,
      })

      if (!result.success) {
        console.error('Failed to spawn PTY:', result.error)
        write(`\r\nFailed to spawn shell: ${result.error}\r\n`)
      } else {
        // Focus terminal after spawn
        setTimeout(() => {
          focus()
          fit()
        }, 100)
      }
    }

    spawnPty()

    // Cleanup: kill PTY on unmount
    return () => {
      window.electron.pty.kill(terminalId)
    }
  }, [terminalId])

  // Focus terminal on mount
  useEffect(() => {
    focus()
  }, [focus])

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  })

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = window.electron.platform === 'darwin'
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey

      // Cmd+C / Ctrl+C - Copy
      if (cmdOrCtrl && e.key === 'c') {
        const hasSelection = terminal?.hasSelection()
        if (hasSelection) {
          e.preventDefault()
          copySelection()
        }
      }

      // Cmd+V / Ctrl+V - Paste
      if (cmdOrCtrl && e.key === 'v') {
        e.preventDefault()
        paste()
      }

      // Cmd+A / Ctrl+A - Select all
      if (cmdOrCtrl && e.key === 'a') {
        e.preventDefault()
        selectAll()
      }
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('keydown', handleKeyDown)
      return () => container.removeEventListener('keydown', handleKeyDown)
    }
  }, [terminal, copySelection, paste, selectAll, containerRef])

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    })
  }, [])

  // Hide context menu on click
  useEffect(() => {
    const handleClick = () => {
      setContextMenu((prev) => ({ ...prev, visible: false }))
    }

    if (contextMenu.visible) {
      window.addEventListener('click', handleClick)
      return () => window.removeEventListener('click', handleClick)
    }
  }, [contextMenu.visible])

  const handleCopy = useCallback(() => {
    copySelection()
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }, [copySelection])

  const handlePaste = useCallback(() => {
    paste()
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }, [paste])

  const handleSelectAll = useCallback(() => {
    selectAll()
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }, [selectAll])

  return (
    <>
      <div
        ref={containerRef}
        onContextMenu={handleContextMenu}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#1e1e1e',
        }}
      />

      {/* Context menu */}
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: '#2d2d2d',
            border: '1px solid #3e3e3e',
            borderRadius: '6px',
            padding: '4px 0',
            minWidth: '160px',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          }}
        >
          <MenuItem
            label="Copy"
            shortcut="⌘C"
            onClick={handleCopy}
            disabled={!terminal?.hasSelection()}
          />
          <MenuItem label="Paste" shortcut="⌘V" onClick={handlePaste} />
          <div style={{ height: '1px', backgroundColor: '#3e3e3e', margin: '4px 8px' }} />
          <MenuItem label="Select All" shortcut="⌘A" onClick={handleSelectAll} />
        </div>
      )}
    </>
  )
}

interface MenuItemProps {
  label: string
  shortcut: string
  onClick: () => void
  disabled?: boolean
}

function MenuItem({ label, shortcut, onClick, disabled }: MenuItemProps) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 12px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        color: '#d4d4d4',
        fontSize: '13px',
        backgroundColor: 'transparent',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = '#3e3e3e'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: '11px', color: '#808080', marginLeft: '24px' }}>{shortcut}</span>
    </div>
  )
}
