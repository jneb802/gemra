import { useState, useCallback } from 'react'

/**
 * Hook for managing git worktree operations
 * Handles worktree list, add, remove, and menu state
 */

export interface Worktree {
  path: string      // Absolute path to worktree directory
  branch: string    // Branch name
  commit: string    // HEAD commit SHA
  isMain: boolean   // Is this the main worktree?
}

export type WorktreeMenuMode = 'list' | 'subcommands'

interface UseWorktreeOperationsOptions {
  workingDir: string
  onAddSystemMessage: (message: string) => void
}

export function useWorktreeOperations({ workingDir, onAddSystemMessage }: UseWorktreeOperationsOptions) {
  const [showWorktreeMenu, setShowWorktreeMenu] = useState(false)
  const [worktreeList, setWorktreeList] = useState<Worktree[]>([])
  const [worktreeMenuMode, setWorktreeMenuMode] = useState<WorktreeMenuMode>('list')

  // List all worktrees
  const listWorktrees = useCallback(async () => {
    try {
      const result = await window.electron.claude.listWorktrees(workingDir)
      if (result.worktrees && result.worktrees.length > 0) {
        setWorktreeList(result.worktrees)
        setShowWorktreeMenu(true)
        setWorktreeMenuMode('list')
        return result.worktrees
      } else {
        onAddSystemMessage('No worktrees found')
        return []
      }
    } catch (error) {
      onAddSystemMessage(
        `Error fetching worktrees: ${error instanceof Error ? error.message : String(error)}`
      )
      return []
    }
  }, [workingDir, onAddSystemMessage])

  // Add a new worktree
  const addWorktree = useCallback(
    async (path: string, branch: string) => {
      try {
        const result = await window.electron.claude.addWorktree(workingDir, path, branch)
        if (result.success) {
          onAddSystemMessage(`✓ Created worktree at: ${path} (branch: ${branch})`)
          // Refresh worktree list
          await listWorktrees()
          return true
        } else {
          onAddSystemMessage(
            `✗ Failed to create worktree: ${path}\n\n${result.error || 'Unknown error'}`
          )
          return false
        }
      } catch (error) {
        onAddSystemMessage(
          `✗ Error creating worktree: ${error instanceof Error ? error.message : String(error)}`
        )
        return false
      }
    },
    [workingDir, onAddSystemMessage, listWorktrees]
  )

  // Remove a worktree
  const removeWorktree = useCallback(
    async (path: string) => {
      try {
        const result = await window.electron.claude.removeWorktree(workingDir, path)
        if (result.success) {
          onAddSystemMessage(`✓ Removed worktree: ${path}`)
          // Refresh worktree list
          await listWorktrees()
          return true
        } else {
          onAddSystemMessage(
            `✗ Failed to remove worktree: ${path}\n\n${result.error || 'Unknown error'}`
          )
          return false
        }
      } catch (error) {
        onAddSystemMessage(
          `✗ Error removing worktree: ${error instanceof Error ? error.message : String(error)}`
        )
        return false
      }
    },
    [workingDir, onAddSystemMessage, listWorktrees]
  )

  // Prune deleted worktrees
  const pruneWorktrees = useCallback(async () => {
    try {
      const result = await window.electron.claude.pruneWorktrees(workingDir)
      if (result.success) {
        onAddSystemMessage('✓ Pruned worktrees')
        return true
      } else {
        onAddSystemMessage(
          `✗ Failed to prune worktrees\n\n${result.error || 'Unknown error'}`
        )
        return false
      }
    } catch (error) {
      onAddSystemMessage(
        `✗ Error pruning worktrees: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }, [workingDir, onAddSystemMessage])

  // Handle worktree click (switches to that worktree by sending a cd command to Claude)
  const handleWorktreeSelect = useCallback(
    (worktree: Worktree) => {
      // Send a message to Claude to cd to the worktree path
      onAddSystemMessage(`Switching to worktree: ${worktree.path} (${worktree.branch})`)
      onAddSystemMessage(`💡 To switch, run: cd ${worktree.path}`)

      setShowWorktreeMenu(false)
      setWorktreeList([])
    },
    [onAddSystemMessage]
  )

  // Handle worktree menu click (triggered by user)
  const handleWorktreeClick = useCallback(() => {
    listWorktrees()
  }, [listWorktrees])

  // Close worktree menu
  const closeWorktreeMenu = useCallback(() => {
    setShowWorktreeMenu(false)
    setWorktreeList([])
    setWorktreeMenuMode('list')
  }, [])

  // Switch to subcommands mode
  const showSubcommands = useCallback(() => {
    setWorktreeMenuMode('subcommands')
  }, [])

  // Switch back to list mode
  const showList = useCallback(() => {
    setWorktreeMenuMode('list')
  }, [])

  return {
    // State
    showWorktreeMenu,
    worktreeList,
    worktreeMenuMode,

    // Actions
    listWorktrees,
    addWorktree,
    removeWorktree,
    pruneWorktrees,
    handleWorktreeSelect,
    handleWorktreeClick,
    closeWorktreeMenu,
    showSubcommands,
    showList
  }
}
