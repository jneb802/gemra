import { useEffect, useState, useCallback, useRef } from 'react'
import { useTerminal } from './useTerminal'
import { useOSC133Parser } from './useOSC133Parser'
import { useFallbackParser } from './useFallbackParser'
import { useBlockStore } from '../../stores/blockStore'
import { useTabStore } from '../../stores/tabStore'
import { useClaudeChatStore } from '../../stores/claudeChatStore'
import { TerminalBlockContent } from './TerminalBlockContent'
import { BlockActions } from './BlockActions'
import { TerminalInput } from './TerminalInput'
import { AIPromptModal } from './AIPromptModal'
import { useBlockAI } from './useBlockAI'
import { showToast } from '../Toast/ToastContainer'
import type { TerminalBlock } from '../../../shared/types/blocks'

interface BlockTerminalProps {
  terminalId: string
  workingDir?: string
  sessionTabs?: React.ReactNode
}

/**
 * BlockTerminal - Block-based terminal with OSC 133 shell integration
 *
 * This component wraps xterm.js with an OSC 133 parser that converts
 * terminal output into discrete blocks (commands + output).
 * Blocks are rendered using the same MessageList component as chat.
 */
export function BlockTerminal({ terminalId, workingDir = '~', sessionTabs }: BlockTerminalProps) {
  const [currentWorkingDir, setCurrentWorkingDir] = useState(workingDir)
  const [gitBranch, setGitBranch] = useState('')
  const [gitStats, setGitStats] = useState({ filesChanged: 0, insertions: 0, deletions: 0 })
  const [shellIntegrationActive, setShellIntegrationActive] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const [autoInstallAttempted, setAutoInstallAttempted] = useState(false)
  const pendingCommandRef = useRef('')
  const blocksContainerRef = useRef<HTMLDivElement>(null)
  // Capture initial workingDir so prop changes don't re-trigger the PTY spawn effect
  const initialWorkingDirRef = useRef(workingDir)
  const prevBlockCountRef = useRef(0)

  // AI prompt modal state
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiPromptTitle, setAiPromptTitle] = useState('')

  // Get blocks from store
  const blocks = useBlockStore(s => s.getBlocks(terminalId))
  const clearBlocks = useBlockStore(s => s.clearBlocks)
  const toggleBlockCollapse = useBlockStore(s => s.toggleBlockCollapse)
  const getActiveBlock = useBlockStore(s => s.getActiveBlock)

  // Tab and chat store
  const tabs = useTabStore(s => s.tabs)
  const activeTabId = useTabStore(s => s.activeTabId)
  const createTab = useTabStore(s => s.createTab)
  const setActiveTab = useTabStore(s => s.setActiveTab)
  const addMessage = useClaudeChatStore(s => s.addMessage)

  // Check if this terminal's tab is the active tab (standalone terminal or active sub-terminal)
  const isActiveTab = (() => {
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (!activeTab) return false
    // Standalone terminal tab
    if (activeTab.terminalId === terminalId) return true
    // Sub-terminal inside an agent-chat tab (only when it's the active sub-terminal)
    return activeTab.subTerminals?.some(
      s => s.terminalId === terminalId && s.id === activeTab.activeSubTerminalId
    ) ?? false
  })()

  // Initialize xterm.js (hidden, used for parsing)
  const { containerRef, terminal, write, focus } = useTerminal({
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

  // Setup OSC 133 parser (primary)
  useOSC133Parser({
    terminal,
    terminalId,
    workingDir: currentWorkingDir,
    pendingCommandRef,
    onBlockCreated: (_blockId) => {
      setShellIntegrationActive(true)
      setUseFallback(false) // Disable fallback if shell integration works
    },
    onWorkingDirChange: setCurrentWorkingDir,
  })

  // Setup fallback parser (heuristic-based)
  useFallbackParser({
    terminal,
    terminalId,
    workingDir: currentWorkingDir,
    enabled: useFallback && !shellIntegrationActive,
  })

  // Enable fallback after timeout if no shell integration detected
  useEffect(() => {
    if (shellIntegrationActive || useFallback) return

    const timeout = setTimeout(() => {
      console.log('[BlockTerminal] No shell integration detected, enabling fallback parser')
      setUseFallback(true)
    }, 5000) // Wait 5 seconds

    return () => clearTimeout(timeout)
  }, [shellIntegrationActive, useFallback])

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
        console.log('[BlockTerminal] Process exited:', data.exitCode)
      }
    })

    return unsubscribe
  }, [terminalId])

  // Spawn PTY once xterm is initialized (terminal non-null means fitAddon.fit() has run
  // and terminal.cols/rows reflect the actual container dimensions)
  useEffect(() => {
    if (!terminal) return

    const spawnPty = async () => {
      const result = await window.electron.pty.spawn(terminalId, {
        cols: terminal.cols,
        rows: terminal.rows,
        cwd: initialWorkingDirRef.current,
      })

      if (!result.success) {
        console.error('Failed to spawn PTY:', result.error)
      } else {
        focus()
      }
    }

    spawnPty()

    // Cleanup: kill PTY when terminalId changes or component unmounts
    return () => {
      console.log('[BlockTerminal] Cleaning up terminal:', terminalId)
      window.electron.pty.kill(terminalId)
      clearBlocks(terminalId)
    }
  }, [terminalId, terminal, clearBlocks, focus])

  // Fetch git info periodically (only when tab is active)
  useEffect(() => {
    if (!isActiveTab) return // Skip polling for inactive tabs

    const fetchGitInfo = async () => {
      try {
        const branchResult = await window.electron.claude.getGitBranch(currentWorkingDir)
        if (branchResult.success && branchResult.branch) {
          setGitBranch(branchResult.branch)
        }

        const statsResult = await window.electron.claude.getGitStats(currentWorkingDir)
        if (statsResult.success) {
          setGitStats({
            filesChanged: statsResult.filesChanged || 0,
            insertions: statsResult.insertions || 0,
            deletions: statsResult.deletions || 0,
          })
        }
      } catch (error) {
        console.error('Failed to fetch git info:', error)
      }
    }

    fetchGitInfo()
    const interval = setInterval(fetchGitInfo, 5000)
    return () => clearInterval(interval)
  }, [currentWorkingDir, isActiveTab])

  // Send command to PTY
  const handleSendCommand = useCallback((command: string) => {
    if (!command.trim()) return

    console.log('[BlockTerminal] Sending command:', command)

    // Store command so the OSC 133 B handler can attach it to the block
    pendingCommandRef.current = command.trim()

    // Send command to PTY (with newline)
    window.electron.pty.write(terminalId, command + '\n')
  }, [terminalId])

  // AI integration
  const blockAI = useBlockAI({
    workingDir: currentWorkingDir,
    onSendToChat: (message) => {
      setAiPrompt(message)
      setAiModalOpen(true)
    },
  })

  // Handle block actions
  const handleRerunCommand = useCallback((command: string) => {
    handleSendCommand(command)
  }, [handleSendCommand])

  const handleExplainError = useCallback((block: TerminalBlock) => {
    setAiPromptTitle('Explain Error')
    blockAI.explainError(block)
  }, [blockAI])

  const handleFixCommand = useCallback((block: TerminalBlock) => {
    setAiPromptTitle('Fix Command')
    blockAI.fixCommand(block)
  }, [blockAI])

  const handleSendToChat = useCallback((block: TerminalBlock) => {
    setAiPromptTitle('Send to Chat')
    blockAI.sendToChat(block)
  }, [blockAI])

  const handleAnalyzeOutput = useCallback((block: TerminalBlock) => {
    setAiPromptTitle('Analyze Output')
    blockAI.analyzeOutput(block)
  }, [blockAI])

  // Compute if command is running (derived state, no useEffect needed)
  const activeBlock = getActiveBlock(terminalId)
  const commandRunning = activeBlock?.status === 'running'

  // Auto-install shell integration on first launch
  useEffect(() => {
    if (autoInstallAttempted) return

    const autoInstall = async () => {
      setAutoInstallAttempted(true)

      try {
        // Check if already installed
        const status = await window.electron.shellIntegration.getStatus()
        console.log('[BlockTerminal] Shell integration status:', status)

        if (status.installed) {
          console.log('[BlockTerminal] Shell integration already installed (will activate on first block)')
        } else {
          // Auto-install if not present
          console.log('[BlockTerminal] Auto-installing shell integration...')
          const result = await window.electron.shellIntegration.enable()

          if (result.success) {
            console.log('[BlockTerminal] Shell integration installed successfully')
          } else {
            console.warn('[BlockTerminal] Shell integration auto-install failed:', result.error)
          }
        }
      } catch (error) {
        console.error('[BlockTerminal] Failed to auto-install shell integration:', error)
      }
    }

    autoInstall()
  }, [autoInstallAttempted])

  // Auto-scroll to bottom when new blocks are created
  useEffect(() => {
    if (blocks.length > prevBlockCountRef.current) {
      // New block was added, scroll to bottom
      if (blocksContainerRef.current) {
        const container = blocksContainerRef.current
        const shouldAutoScroll =
          container.scrollHeight - container.scrollTop - container.clientHeight < 200

        if (shouldAutoScroll) {
          setTimeout(() => {
            container.scrollTo({
              top: container.scrollHeight,
              behavior: 'smooth',
            })
          }, 100)
        }
      }
    }
    prevBlockCountRef.current = blocks.length
  }, [blocks.length])

  return (
    <div className="block-terminal">

      {/* Block list - always rendered to maintain layout */}
      <div className="terminal-blocks-container" ref={blocksContainerRef}>
        {blocks.map((block, index) => {
          const prevBlock = index > 0 ? blocks[index - 1] : null
          const isGrouped = prevBlock?.type === block.type

          return (
            <div
              key={block.id}
              className="terminal-block-wrapper block-fade-in"
            >
              <TerminalBlockContent block={block} isGrouped={isGrouped} />
              <BlockActions
                block={block}
                onRerun={handleRerunCommand}
                onToggleCollapse={() => toggleBlockCollapse(terminalId, block.id)}
                onExplainError={() => handleExplainError(block)}
                onFixCommand={() => handleFixCommand(block)}
                onSendToChat={() => handleSendToChat(block)}
                onAnalyzeOutput={() => handleAnalyzeOutput(block)}
              />
            </div>
          )
        })}
      </div>

      {/* Session tabs - positioned above terminal input */}
      {sessionTabs}

      {/* Terminal input */}
      <TerminalInput
        terminalId={terminalId}
        workingDir={currentWorkingDir}
        gitBranch={gitBranch}
        gitStats={gitStats}
        onSendCommand={handleSendCommand}
        disabled={commandRunning}
      />

      {/* AI prompt modal */}
      <AIPromptModal
        isOpen={aiModalOpen}
        title={aiPromptTitle}
        prompt={aiPrompt}
        onClose={() => setAiModalOpen(false)}
        onSendToChat={() => {
          // Find or create an agent-chat tab
          let chatTab = tabs.find(tab => tab.type === 'agent-chat')

          if (!chatTab) {
            const newTabId = createTab({
              type: 'agent-chat',
              workingDir: currentWorkingDir
            })
            chatTab = useTabStore.getState().tabs.find(tab => tab.id === newTabId)
          }

          if (chatTab) {
            if (chatTab.agentId) {
              addMessage(chatTab.agentId, {
                id: `msg-${Date.now()}`,
                role: 'user',
                content: aiPrompt,
                timestamp: Date.now(),
              })

              setActiveTab(chatTab.id)
              showToast('Sent to chat tab')
            } else {
              showToast('Chat session not initialized yet')
            }
          }

          setAiModalOpen(false)
        }}
      />

      {/* Hidden xterm.js container (used for parsing only) */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: -10000,
          left: -10000,
          width: '800px',
          height: '600px',
          visibility: 'hidden',
        }}
      />
    </div>
  )
}
