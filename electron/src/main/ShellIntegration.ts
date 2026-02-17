import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export class ShellIntegrationManager {
  private integrationDir: string
  private scriptsDir: string

  constructor() {
    // Store integration scripts in app data
    this.integrationDir = path.join(app.getPath('userData'), 'shell-integration')

    // In development, scripts are in src/main/shell-scripts
    // In production, they should be in resources/shell-scripts
    const isDev = !app.isPackaged
    this.scriptsDir = isDev
      ? path.join(__dirname, '../../src/main/shell-scripts')
      : path.join(__dirname, '../resources/shell-scripts')

    this.ensureIntegrationDir()
  }

  private ensureIntegrationDir() {
    if (!fs.existsSync(this.integrationDir)) {
      fs.mkdirSync(this.integrationDir, { recursive: true })
    }
  }

  /**
   * Copy shell integration scripts to app data directory
   */
  async installScripts(): Promise<void> {
    const scripts = ['zsh-integration.sh', 'bash-integration.sh', 'fish-integration.fish']

    for (const script of scripts) {
      const source = path.join(this.scriptsDir, script)
      const dest = path.join(this.integrationDir, script)

      if (fs.existsSync(source)) {
        fs.copyFileSync(source, dest)
        console.log(`[Shell Integration] Installed ${script}`)
      } else {
        console.warn(`[Shell Integration] Script not found: ${source}`)
      }
    }
  }

  /**
   * Detect user's shell
   */
  detectShell(): 'zsh' | 'bash' | 'fish' | 'unknown' {
    const shell = process.env.SHELL || '/bin/bash'

    if (shell.includes('zsh')) return 'zsh'
    if (shell.includes('bash')) return 'bash'
    if (shell.includes('fish')) return 'fish'

    return 'unknown'
  }

  /**
   * Get the RC file path for a shell
   */
  getShellRcPath(shell: 'zsh' | 'bash' | 'fish'): string {
    const home = os.homedir()

    switch (shell) {
      case 'zsh':
        return path.join(home, '.zshrc')
      case 'bash':
        // Try .bashrc first, fall back to .bash_profile
        const bashrc = path.join(home, '.bashrc')
        const bashProfile = path.join(home, '.bash_profile')
        return fs.existsSync(bashrc) ? bashrc : bashProfile
      case 'fish':
        return path.join(home, '.config/fish/config.fish')
    }
  }

  /**
   * Check if shell integration is already installed
   */
  isIntegrationInstalled(shell: 'zsh' | 'bash' | 'fish'): boolean {
    const rcPath = this.getShellRcPath(shell)

    if (!fs.existsSync(rcPath)) return false

    const content = fs.readFileSync(rcPath, 'utf-8')
    return content.includes('Gemra') && content.includes('shell integration')
  }

  /**
   * Add shell integration to user's RC file
   */
  async enableIntegration(shell: 'zsh' | 'bash' | 'fish'): Promise<{ success: boolean; error?: string }> {
    try {
      const rcPath = this.getShellRcPath(shell)
      const scriptName = shell === 'fish' ? 'fish-integration.fish' : `${shell}-integration.sh`
      const scriptPath = path.join(this.integrationDir, scriptName)

      // Ensure scripts are installed
      await this.installScripts()

      // Check if already installed
      if (this.isIntegrationInstalled(shell)) {
        console.log('[Shell Integration] Already installed')
        return { success: true }
      }

      // Create RC file if it doesn't exist
      if (!fs.existsSync(rcPath)) {
        const dir = path.dirname(rcPath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(rcPath, '')
      }

      // Add integration source line
      const integrationLine = shell === 'fish'
        ? `\n# Gemra Terminal - Shell integration\nif test -f "${scriptPath}"\n    source "${scriptPath}"\nend\n`
        : `\n# Gemra Terminal - Shell integration\nif [ -f "${scriptPath}" ]; then\n    source "${scriptPath}"\nfi\n`

      fs.appendFileSync(rcPath, integrationLine)

      console.log(`[Shell Integration] Enabled for ${shell}`)
      return { success: true }

    } catch (error) {
      console.error('[Shell Integration] Failed to enable:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Remove shell integration from RC file
   */
  async disableIntegration(shell: 'zsh' | 'bash' | 'fish'): Promise<{ success: boolean; error?: string }> {
    try {
      const rcPath = this.getShellRcPath(shell)

      if (!fs.existsSync(rcPath)) {
        return { success: true }
      }

      let content = fs.readFileSync(rcPath, 'utf-8')

      // Remove integration block
      const lines = content.split('\n')
      const filtered: string[] = []
      let inGemraBlock = false

      for (const line of lines) {
        if (line.includes('Gemra') && line.includes('Shell integration')) {
          inGemraBlock = true
          continue
        }

        if (inGemraBlock) {
          // Skip lines until we find the end of the block
          if (shell === 'fish') {
            if (line.trim() === 'end') {
              inGemraBlock = false
            }
          } else {
            if (line.trim() === 'fi') {
              inGemraBlock = false
            }
          }
          continue
        }

        filtered.push(line)
      }

      fs.writeFileSync(rcPath, filtered.join('\n'))

      console.log(`[Shell Integration] Disabled for ${shell}`)
      return { success: true }

    } catch (error) {
      console.error('[Shell Integration] Failed to disable:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Get integration status
   */
  getStatus(): {
    shell: string
    installed: boolean
    scriptsPath: string
  } {
    const shell = this.detectShell()
    const installed = shell !== 'unknown' && this.isIntegrationInstalled(shell)

    return {
      shell,
      installed,
      scriptsPath: this.integrationDir,
    }
  }
}

// Singleton instance
export const shellIntegration = new ShellIntegrationManager()
