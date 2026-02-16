import { exec } from 'child_process'
import { promisify } from 'util'
import { createIpcHandler } from '../utils/ipcUtils'

const execAsync = promisify(exec)

export function setupGitIpc() {
  // Clone repository
  createIpcHandler('git:clone', async (url: string, targetPath: string) => {
    await execAsync(`git clone "${url}" "${targetPath}"`)
    return { path: targetPath }
  })

  // Initialize git repository
  createIpcHandler('git:init', async (dirPath: string) => {
    await execAsync(`git init "${dirPath}"`)
    return {}
  })

  // Get current branch
  createIpcHandler('git:get-branch', async (dirPath: string) => {
    const { stdout } = await execAsync('git branch --show-current', {
      cwd: dirPath
    })
    return { branch: stdout.trim() }
  })
}
