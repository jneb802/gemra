import { execSync } from 'child_process'

/**
 * Execute a git command in a specific directory
 */
export function execGit(command: string, workingDir: string): string {
  return execSync(`git ${command}`, {
    cwd: workingDir,
    encoding: 'utf-8',
  }).trim()
}

/**
 * Get the current git branch name
 */
export function getGitBranch(workingDir: string): string {
  return execGit('rev-parse --abbrev-ref HEAD', workingDir)
}

/**
 * Get git diff shortstat output
 */
export function getGitDiffShortstat(workingDir: string): string {
  return execGit('diff --shortstat', workingDir)
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
