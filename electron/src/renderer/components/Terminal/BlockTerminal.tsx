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
import { BlockNavigation } from './BlockNavigation'
import { AIPromptModal } from './AIPromptModal'
import { useBlockAI } from './useBlockAI'
import { showToast } from '../Toast/ToastContainer'
import type { TerminalBlock } from '../../../shared/types/blocks'

interface BlockTerminalProps {
  terminalId: string
  workingDir?: string
}

/**
 * BlockTerminal - Block-based terminal with OSC 133 shell integration
 *
 * This component wraps xterm.js with an OSC 133 parser that converts
 * terminal output into discrete blocks (commands + output).
 * Blocks are rendered using the same MessageList component as chat.
 */
export function BlockTerminal({ terminalId, workingDir = '~' }: BlockTerminalProps) {
  const [currentWorkingDir, setCurrentWorkingDir] = useState(workingDir)
  const [gitBranch, setGitBranch] = useState('')
  const [gitStats, setGitStats] = useState({ filesChanged: 0, insertions: 0, deletions: 0 })
  const [shellIntegrationActive, setShellIntegrationActive] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const [selectedBlockId, setSelectedBlockId] = useState<string>()
  const [blockFilter, setBlockFilter] = useState<'all' | 'failed' | 'success'>('all')
  const [autoInstallAttempted, setAutoInstallAttempted] = useState(false)
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const blocksContainerRef = useRef<HTMLDivElement>(null)
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
  const getActiveChatSession = useTabStore(s => s.getActiveChatSession)
  const addMessage = useClaudeChatStore(s => s.addMessage)

  // Check if this terminal is in the active tab
  const isActiveTab = tabs.find(t => t.id === activeTabId)?.id === terminalId

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
    onBlockCreated: (blockId) => {
      console.log('[BlockTerminal] Shell integration active, block created:', blockId)
      setShellIntegrationActive(true)
      setUseFallback(false) // Disable fallback if shell integration works
    },
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

  // Spawn PTY on mount
  useEffect(() => {
    const spawnPty = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))

      const result = await window.electron.pty.spawn(terminalId, {
        cols: 80,
        rows: 24,
        cwd: workingDir,
      })

      if (!result.success) {
        console.error('Failed to spawn PTY:', result.error)
      } else {
        focus()
      }
    }

    spawnPty()

    // Cleanup: kill PTY on unmount
    return () => {
      console.log('[BlockTerminal] Cleaning up terminal:', terminalId)
      window.electron.pty.kill(terminalId)
      clearBlocks(terminalId)
    }
  }, [terminalId, workingDir, clearBlocks])

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

  // Navigate to a specific block
  const handleNavigateToBlock = useCallback((blockId: string) => {
    setSelectedBlockId(blockId)
    const element = blockRefs.current.get(blockId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Highlight briefly
      element.style.boxShadow = '0 0 0 2px var(--button-primary)'
      setTimeout(() => {
        element.style.boxShadow = ''
      }, 1000)
    }
  }, [])

  // Filter blocks
  const filteredBlocks = blocks.filter(block => {
    if (blockFilter === 'failed') {
      return block.exitCode !== undefined && block.exitCode !== 0
    } else if (blockFilter === 'success') {
      return block.exitCode === 0
    }
    return true
  })

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

      {/* Block navigation (search & filter) */}
      {blocks.length > 0 && (
        <BlockNavigation
          blocks={blocks}
          currentBlockId={selectedBlockId}
          onNavigate={handleNavigateToBlock}
          onFilter={setBlockFilter}
        />
      )}

      {/* Block list - always rendered to maintain layout */}
      <div className="terminal-blocks-container" ref={blocksContainerRef}>
        {filteredBlocks.length > 0 ? (
          filteredBlocks.map((block, index) => {
            const prevBlock = index > 0 ? filteredBlocks[index - 1] : null
            const isGrouped = prevBlock?.type === block.type

            return (
              <div
                key={block.id}
                ref={(el) => {
                  if (el) blockRefs.current.set(block.id, el)
                }}
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
          })
        ) : blocks.length > 0 ? (
          <div className="terminal-blocks-empty">
            <p>No blocks match the current filter</p>
          </div>
        ) : null}
      </div>

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
          // Find or create a Claude chat tab
          let chatTab = tabs.find(tab => tab.type === 'claude-chat')

          if (!chatTab) {
            // Create a new Claude chat tab
            const newTabId = createTab({
              type: 'claude-chat',
              workingDir: currentWorkingDir
            })
            chatTab = tabs.find(tab => tab.id === newTabId)
          }

          if (chatTab) {
            // Get the active chat session for this tab
            const session = getActiveChatSession(chatTab.id)

            if (session?.agentId) {
              // Add the message to the chat
              addMessage(session.agentId, {
                id: `msg-${Date.now()}`,
                role: 'user',
                content: aiPrompt,
                timestamp: Date.now(),
              })

              // Switch to the chat tab
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
