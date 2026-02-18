import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import type { ProjectCommand } from '../../shared/commandTypes'

const COMMANDS_DIR = '.claude/commands'

export function loadCommands(workingDir: string): ProjectCommand[] {
  const commandsDir = path.join(workingDir, COMMANDS_DIR)

  if (!fs.existsSync(commandsDir)) {
    return []
  }

  const commands: ProjectCommand[] = []

  let files: string[]
  try {
    files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  } catch {
    return []
  }

  for (const file of files) {
    const filePath = path.join(commandsDir, file)
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = yaml.parse(content)
      if (parsed && parsed.name && parsed.type) {
        commands.push(parsed as ProjectCommand)
      }
    } catch (err) {
      console.error(`[CommandLoader] Failed to parse ${file}:`, err)
    }
  }

  return commands
}

export function watchCommands(
  workingDir: string,
  onChange: () => void
): (() => void) | null {
  const commandsDir = path.join(workingDir, COMMANDS_DIR)

  if (!fs.existsSync(commandsDir)) {
    return null
  }

  try {
    const watcher = fs.watch(commandsDir, { persistent: false }, () => {
      onChange()
    })
    return () => watcher.close()
  } catch {
    return null
  }
}
