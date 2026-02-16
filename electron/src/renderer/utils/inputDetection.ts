/**
 * Input detection utility for Command/AI mode toggle
 * Uses heuristic scoring to detect command vs AI input
 */

import type { DetectedType } from '../types/inputMode'

// Common Unix/shell commands (~500 commands)
const KNOWN_COMMANDS = new Set([
  // Core utilities
  'ls', 'cd', 'pwd', 'cat', 'echo', 'cp', 'mv', 'rm', 'mkdir', 'rmdir',
  'touch', 'chmod', 'chown', 'ln', 'find', 'grep', 'sed', 'awk', 'cut',
  'sort', 'uniq', 'wc', 'head', 'tail', 'less', 'more', 'file', 'du', 'df',

  // Git commands
  'git', 'git-status', 'git-add', 'git-commit', 'git-push', 'git-pull',
  'git-checkout', 'git-branch', 'git-merge', 'git-rebase', 'git-log',
  'git-diff', 'git-clone', 'git-fetch', 'git-reset', 'git-stash',

  // Package managers
  'npm', 'yarn', 'pnpm', 'bun', 'pip', 'pip3', 'brew', 'apt', 'apt-get',
  'yum', 'dnf', 'pacman', 'cargo', 'gem', 'bundle', 'composer',

  // Build tools
  'make', 'cmake', 'ninja', 'gcc', 'g++', 'clang', 'rustc', 'javac',
  'node', 'python', 'python3', 'ruby', 'perl', 'php', 'go', 'deno',

  // System
  'ps', 'top', 'htop', 'kill', 'killall', 'pkill', 'systemctl', 'service',
  'sudo', 'su', 'whoami', 'which', 'whereis', 'man', 'help', 'history',

  // Network
  'curl', 'wget', 'ssh', 'scp', 'rsync', 'ping', 'traceroute', 'netstat',
  'ifconfig', 'ip', 'nslookup', 'dig', 'host', 'nc', 'telnet', 'ftp',

  // Archive
  'tar', 'gzip', 'gunzip', 'bzip2', 'bunzip2', 'zip', 'unzip', 'rar', 'unrar',

  // Docker/containers
  'docker', 'docker-compose', 'kubectl', 'podman', 'nerdctl',

  // Text editors
  'vim', 'vi', 'nvim', 'nano', 'emacs', 'code', 'subl',

  // Database
  'mysql', 'psql', 'sqlite3', 'mongo', 'redis-cli',

  // Testing
  'jest', 'mocha', 'pytest', 'rspec', 'cargo-test',

  // Misc dev tools
  'terraform', 'ansible', 'vagrant', 'heroku', 'netlify', 'vercel',
  'aws', 'gcloud', 'az', 'gh', 'hub',

  // Shell builtins
  'export', 'source', 'alias', 'unalias', 'set', 'unset', 'env',

  // Additional common commands
  'clear', 'date', 'cal', 'uptime', 'uname', 'hostname', 'users', 'who',
  'w', 'last', 'lastb', 'mount', 'umount', 'fdisk', 'lsblk', 'blkid',
  'crontab', 'at', 'watch', 'screen', 'tmux', 'bg', 'fg', 'jobs',
  'printenv', 'sleep', 'timeout', 'nohup', 'xargs', 'tee', 'basename',
  'dirname', 'readlink', 'stat', 'md5sum', 'sha1sum', 'sha256sum',
  'diff', 'patch', 'tr', 'expand', 'unexpand', 'fold', 'fmt', 'pr',
  'column', 'paste', 'join', 'comm', 'nl', 'od', 'hexdump', 'xxd',
  'strings', 'base64', 'uuencode', 'uudecode', 'gzip', 'bzip2', 'xz',
  'compress', 'uncompress', 'zcat', 'bzcat', 'xzcat', 'zless', 'bzless',
])

// Question words that suggest AI query
const QUESTION_WORDS = new Set([
  'what', 'why', 'how', 'when', 'where', 'who', 'which', 'whose',
  'can', 'could', 'would', 'should', 'is', 'are', 'was', 'were',
  'do', 'does', 'did', 'explain', 'tell', 'show', 'describe',
])

// Conversational phrases that suggest AI query
const CONVERSATIONAL_PHRASES = [
  'please', 'help me', 'can you', 'could you', 'would you',
  'i need', 'i want', 'how do i', 'what is', 'tell me',
]

// Shell operators that strongly suggest command
const SHELL_OPERATORS = ['|', '&&', '||', ';', '>', '>>', '<', '<<', '2>&1', '&']

/**
 * Detect whether input is a command or AI query using heuristic scoring
 * Score range: -100 to +100 (negative = AI, positive = Command)
 */
export function detectInputType(input: string): DetectedType {
  const trimmed = input.trim()

  // Empty input defaults to AI
  if (!trimmed) {
    return 'ai'
  }

  // Skip slash commands (handled separately)
  if (trimmed.startsWith('/')) {
    return 'ai'
  }

  let score = 0
  const lowerInput = trimmed.toLowerCase()
  const words = lowerInput.split(/\s+/)
  const firstWord = words[0]

  // === COMMAND INDICATORS (positive scores) ===

  // Known command at start (+100 - very strong signal)
  if (KNOWN_COMMANDS.has(firstWord)) {
    score += 100
  }

  // Shell operators (+60 per operator - strong signal)
  for (const op of SHELL_OPERATORS) {
    if (trimmed.includes(op)) {
      score += 60
    }
  }

  // Path references (+50 - strong signal)
  if (/(^|\s)(\.\/|~\/|\/[a-zA-Z])/.test(trimmed)) {
    score += 50
  }

  // Variables (+40 - moderate signal)
  if (/\$[A-Za-z_][A-Za-z0-9_]*|\$\{[^}]+\}|\$\(/.test(trimmed)) {
    score += 40
  }

  // Command flags (+30 - moderate signal)
  if (/(^|\s)-[a-zA-Z]|\s--[a-z][a-z-]+/.test(trimmed)) {
    score += 30
  }

  // Ends with semicolon or ampersand (+25)
  if (/[;&]$/.test(trimmed)) {
    score += 25
  }

  // Command substitution (+40)
  if (/`[^`]+`/.test(trimmed)) {
    score += 40
  }

  // === AI INDICATORS (negative scores) ===

  // Question mark (-80 - very strong signal)
  if (trimmed.includes('?')) {
    score -= 80
  }

  // Question word at start (-100 - very strong signal)
  if (QUESTION_WORDS.has(firstWord)) {
    score -= 100
  }

  // Conversational phrases (-60 each)
  for (const phrase of CONVERSATIONAL_PHRASES) {
    if (lowerInput.includes(phrase)) {
      score -= 60
    }
  }

  // Multiple sentences (-70 - strong signal)
  const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim())
  if (sentences.length > 2) {
    score -= 70
  }

  // Very long input suggests natural language (-30)
  if (words.length > 15) {
    score -= 30
  }

  // Natural language patterns (-40)
  if (/\b(the|a|an|this|that|these|those)\b/i.test(trimmed)) {
    score -= 40
  }

  // Polite language (-50)
  if (/\b(thanks|thank you|sorry|excuse me)\b/i.test(trimmed)) {
    score -= 50
  }

  // === FINAL DECISION ===

  // Positive score = command, negative = AI
  return score >= 0 ? 'command' : 'ai'
}

/**
 * Get a human-readable explanation of why input was classified a certain way
 * Useful for debugging
 */
export function explainDetection(input: string): string {
  const trimmed = input.trim()
  const lowerInput = trimmed.toLowerCase()
  const words = lowerInput.split(/\s+/)
  const firstWord = words[0]

  const reasons: string[] = []

  if (KNOWN_COMMANDS.has(firstWord)) {
    reasons.push(`✓ Starts with known command: "${firstWord}"`)
  }

  for (const op of SHELL_OPERATORS) {
    if (trimmed.includes(op)) {
      reasons.push(`✓ Contains shell operator: "${op}"`)
    }
  }

  if (trimmed.includes('?')) {
    reasons.push(`✗ Contains question mark`)
  }

  if (QUESTION_WORDS.has(firstWord)) {
    reasons.push(`✗ Starts with question word: "${firstWord}"`)
  }

  for (const phrase of CONVERSATIONAL_PHRASES) {
    if (lowerInput.includes(phrase)) {
      reasons.push(`✗ Contains conversational phrase: "${phrase}"`)
    }
  }

  if (/(^|\s)(\.\/|~\/|\/[a-zA-Z])/.test(trimmed)) {
    reasons.push(`✓ Contains path reference`)
  }

  if (/\$[A-Za-z_]/.test(trimmed)) {
    reasons.push(`✓ Contains variable reference`)
  }

  return reasons.join('\n') || 'No strong signals detected'
}
