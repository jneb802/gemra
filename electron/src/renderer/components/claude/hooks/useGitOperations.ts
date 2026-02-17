import { useState, useEffect, useCallback } from 'react'
import { TIMING } from '../../../../shared/constants'

/**
 * Hook for managing git operations (branch, status, checkout)
 * Handles git stats polling and branch UI state
 */

interface GitStats {
  filesChanged: number
  insertions: number
  deletions: number
}

interface UseGitOperationsOptions {
  workingDir: string
  onAddSystemMessage: (message: string) => void
}

export function useGitOperations({ workingDir, onAddSystemMessage }: UseGitOperationsOptions) {
  const [gitBranch, setGitBranch] = useState<string>('main')
  const [gitStats, setGitStats] = useState<GitStats>({ filesChanged: 0, insertions: 0, deletions: 0 })
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const [branchList, setBranchList] = useState<string[]>([])

  // Update git stats helper
  const updateGitStats = useCallback(async () => {
    const result = await window.electron.claude.getGitStats(workingDir)
    if (result.success) {
      setGitStats({
        filesChanged: result.filesChanged,
        insertions: result.insertions,
        deletions: result.deletions
      })
    }
  }, [workingDir])

  // Initialize git branch and start polling
  useEffect(() => {
    // Get initial git branch
    window.electron.claude.getGitBranch(workingDir).then((result) => {
      if (result.success) {
        setGitBranch(result.branch)
      }
    })

    // Get initial git stats
    updateGitStats()

    // Start polling git stats
    const statsInterval = setInterval(updateGitStats, TIMING.GIT_STATS_POLL_INTERVAL)

    return () => {
      clearInterval(statsInterval)
    }
  }, [workingDir, updateGitStats])

  // Checkout branch
  const checkoutBranch = useCallback(
    async (branch: string) => {
      try {
        const result = await window.electron.claude.checkoutBranch(workingDir, branch)
        if (result.success && result.branch) {
          setGitBranch(result.branch)
          onAddSystemMessage(`✓ Checked out branch: ${result.branch}`)
          return true
        } else {
          onAddSystemMessage(
            `✗ Failed to checkout branch: ${branch}\n\n${result.error || 'Unknown error'}`
          )
          return false
        }
      } catch (error) {
        onAddSystemMessage(
          `✗ Error checking out branch: ${error instanceof Error ? error.message : String(error)}`
        )
        return false
      }
    },
    [workingDir, onAddSystemMessage]
  )

  // Create new branch
  const createBranch = useCallback(
    async (branchName: string, checkout: boolean = true) => {
      try {
        const result = await window.electron.claude.createBranch(workingDir, branchName, checkout)
        if (result.success && result.branch) {
          if (checkout) {
            setGitBranch(result.branch)
          }
          onAddSystemMessage(`✓ Created${checkout ? ' and checked out' : ''} branch: ${result.branch}`)
          return true
        } else {
          onAddSystemMessage(
            `✗ Failed to create branch: ${branchName}\n\n${result.error || 'Unknown error'}`
          )
          return false
        }
      } catch (error) {
        onAddSystemMessage(
          `✗ Error creating branch: ${error instanceof Error ? error.message : String(error)}`
        )
        return false
      }
    },
    [workingDir, onAddSystemMessage]
  )

  // Fetch branch list
  const fetchBranches = useCallback(async () => {
    try {
      const result = await window.electron.claude.getGitBranches(workingDir)
      if (result.success && result.branches.length > 0) {
        setBranchList(result.branches)
        setShowBranchMenu(true)
        return result.branches
      } else {
        onAddSystemMessage('No branches found')
        return []
      }
    } catch (error) {
      onAddSystemMessage(
        `Error fetching branches: ${error instanceof Error ? error.message : String(error)}`
      )
      return []
    }
  }, [workingDir, onAddSystemMessage])

  // Handle branch click in status bar
  const handleBranchClick = useCallback(() => {
    fetchBranches()
  }, [fetchBranches])

  // Handle branch selection from menu
  const handleBranchSelect = useCallback(
    (branch: string) => {
      checkoutBranch(branch)
      setShowBranchMenu(false)
      setBranchList([])
    },
    [checkoutBranch]
  )

  // Close branch menu
  const closeBranchMenu = useCallback(() => {
    setShowBranchMenu(false)
    setBranchList([])
  }, [])

  // Get git status
  const getGitStatus = useCallback(async () => {
    const result = await window.electron.claude.getGitStats(workingDir)
    if (result.success) {
      const status = `Files: ${result.filesChanged}, +${result.insertions}, -${result.deletions}`
      onAddSystemMessage(`Git status: ${status}`)
      return { success: true, status }
    } else {
      onAddSystemMessage('Failed to get git status')
      return { success: false }
    }
  }, [workingDir, onAddSystemMessage])

  return {
    // State
    gitBranch,
    gitStats,
    showBranchMenu,
    branchList,

    // Actions
    checkoutBranch,
    createBranch,
    fetchBranches,
    handleBranchClick,
    handleBranchSelect,
    closeBranchMenu,
    getGitStatus,
    updateGitStats
  }
}
