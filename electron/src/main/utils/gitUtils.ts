import { execSync } from 'child_process'

/**
 * Execute a git command in a specific directory
 */
export function execGit(command: string, workingDir: string): string {
  return execSync(`git ${command}`, {
    cwd: workingDir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

/**
 * Get the current git branch name, or null if not a git repo
 */
export function getGitBranch(workingDir: string): string | null {
  try {
    return execGit('rev-parse --abbrev-ref HEAD', workingDir)
  } catch {
    return null
  }
}

/**
 * Get git diff shortstat output, or empty string if not a git repo
 */
export function getGitDiffShortstat(workingDir: string): string {
  try {
    return execGit('diff --shortstat', workingDir)
  } catch {
    return ''
  }
}

/**
 * Parse git shortstat output into structured data
 * Example input: "3 files changed, 10 insertions(+), 5 deletions(-)"
 */
export function parseGitShortstat(shortstat: string): {
  filesChanged: number
  insertions: number
  deletions: number
} {
  let filesChanged = 0
  let insertions = 0
  let deletions = 0

  if (shortstat) {
    const filesMatch = shortstat.match(/(\d+) files? changed/)
    const insertionsMatch = shortstat.match(/(\d+) insertions?/)
    const deletionsMatch = shortstat.match(/(\d+) deletions?/)

    filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0
    insertions = insertionsMatch ? parseInt(insertionsMatch[1]) : 0
    deletions = deletionsMatch ? parseInt(deletionsMatch[1]) : 0
  }

  return { filesChanged, insertions, deletions }
}

/**
 * Get git stats (files changed, insertions, deletions)
 */
export function getGitStats(workingDir: string) {
  const shortstat = getGitDiffShortstat(workingDir)
  return parseGitShortstat(shortstat)
}

/**
 * Get list of all git branches sorted by most recent commit first
 */
export function getGitBranches(workingDir: string): string[] {
  try {
    const output = execGit('branch --sort=-committerdate --format="%(refname:short)"', workingDir)
    return output.split('\n').filter((b) => b.trim())
  } catch (error) {
    console.error('Failed to get git branches:', error)
    return []
  }
}

/**
 * Checkout a git branch
 */
export function checkoutBranch(workingDir: string, branch: string): { success: boolean; error?: string } {
  try {
    execGit(`checkout "${branch}"`, workingDir)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Create a new git branch and optionally check it out
 */
export function createBranch(workingDir: string, branchName: string, checkout = true): { success: boolean; error?: string } {
  try {
    if (checkout) {
      execGit(`checkout -b "${branchName}"`, workingDir)
    } else {
      execGit(`branch "${branchName}"`, workingDir)
    }
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Worktree data structure
 */
export interface Worktree {
  path: string      // Absolute path to worktree directory
  branch: string    // Branch name (without refs/heads/)
  commit: string    // HEAD commit SHA
  isMain: boolean   // Is this the main worktree?
}

/**
 * List all git worktrees
 */
export function listWorktrees(workingDir: string): Worktree[] {
  try {
    const output = execGit('worktree list --porcelain', workingDir)
    const worktrees: Worktree[] = []

    // Parse porcelain output
    // Format:
    // worktree /path
    // HEAD abc123
    // branch refs/heads/main
    // (blank line between worktrees)

    const lines = output.split('\n')
    let currentWorktree: Partial<Worktree> = {}
    let isFirst = true

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        currentWorktree.path = line.substring('worktree '.length)
        currentWorktree.isMain = isFirst
        isFirst = false
      } else if (line.startsWith('HEAD ')) {
        currentWorktree.commit = line.substring('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        const branchRef = line.substring('branch '.length)
        // Strip refs/heads/ prefix
        currentWorktree.branch = branchRef.replace(/^refs\/heads\//, '')
      } else if (line.trim() === '' && currentWorktree.path) {
        // End of current worktree entry
        worktrees.push({
          path: currentWorktree.path,
          branch: currentWorktree.branch || '(detached)',
          commit: currentWorktree.commit || '',
          isMain: currentWorktree.isMain || false
        })
        currentWorktree = {}
      }
    }

    // Handle last entry if no trailing newline
    if (currentWorktree.path) {
      worktrees.push({
        path: currentWorktree.path,
        branch: currentWorktree.branch || '(detached)',
        commit: currentWorktree.commit || '',
        isMain: currentWorktree.isMain || false
      })
    }

    return worktrees
  } catch (error) {
    console.error('Failed to list worktrees:', error)
    return []
  }
}

/**
 * Add a new worktree
 */
export function addWorktree(workingDir: string, path: string, branch: string): { success: boolean; error?: string } {
  try {
    execGit(`worktree add "${path}" "${branch}"`, workingDir)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Remove a worktree
 */
export function removeWorktree(workingDir: string, path: string): { success: boolean; error?: string } {
  try {
    execGit(`worktree remove "${path}"`, workingDir)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Prune worktree information for deleted directories
 */
export function pruneWorktrees(workingDir: string): { success: boolean; error?: string } {
  try {
    execGit('worktree prune', workingDir)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
