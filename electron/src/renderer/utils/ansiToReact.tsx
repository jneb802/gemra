import React from 'react'

/**
 * ANSI color codes to CSS colors
 */
const ANSI_COLORS: Record<string, string> = {
  // Standard colors (30-37, 90-97)
  '30': '#000000',  // Black
  '31': '#e06c75',  // Red
  '32': '#98c379',  // Green
  '33': '#e5c07b',  // Yellow
  '34': '#61afef',  // Blue
  '35': '#c678dd',  // Magenta
  '36': '#56b6c2',  // Cyan
  '37': '#abb2bf',  // White

  // Bright colors
  '90': '#5c6370',  // Bright Black (Gray)
  '91': '#e06c75',  // Bright Red
  '92': '#98c379',  // Bright Green
  '93': '#e5c07b',  // Bright Yellow
  '94': '#61afef',  // Bright Blue
  '95': '#c678dd',  // Bright Magenta
  '96': '#56b6c2',  // Bright Cyan
  '97': '#ffffff',  // Bright White

  // Background colors (40-47, 100-107)
  '40': '#000000',
  '41': '#e06c75',
  '42': '#98c379',
  '43': '#e5c07b',
  '44': '#61afef',
  '45': '#c678dd',
  '46': '#56b6c2',
  '47': '#abb2bf',
}

interface AnsiStyle {
  color?: string
  backgroundColor?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  dim?: boolean
}

/**
 * Parse ANSI escape codes and convert to styled React elements
 */
export function ansiToReact(text: string): React.ReactNode {
  // First, strip OSC (Operating System Command) sequences
  // These include shell integration markers like OSC 133
  // Format: ESC ] ... (ST | BEL) where ST = ESC \ and BEL = \x07
  text = text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')

  // Also strip any malformed OSC sequences that lost their escape characters
  text = text.replace(/\]133;[A-D](?:;[0-9]+)?\s*/g, '')

  // Strip all non-SGR CSI sequences (cursor movement, screen clearing, etc.)
  // Keep only SGR (Select Graphic Rendition) sequences for color/styling
  text = text.replace(/\x1b\[[\d;]*[A-KM-Za-km-z]/g, (match) => {
    // Keep SGR sequences (ending in 'm')
    if (match.endsWith('m')) return match
    // Strip everything else (cursor movement, clear, etc.)
    return ''
  })

  // Remove ANSI sequences if they exist, otherwise return plain text
  const ansiRegex = /\x1b\[([0-9;]*)m/g

  if (!ansiRegex.test(text)) {
    // No ANSI codes, return plain text
    return text
  }

  const parts: React.ReactNode[] = []
  let currentStyle: AnsiStyle = {}
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Reset regex
  ansiRegex.lastIndex = 0

  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before this escape code
    if (match.index > lastIndex) {
      const textContent = text.substring(lastIndex, match.index)
      parts.push(
        <span key={parts.length} style={styleToCSS(currentStyle)}>
          {textContent}
        </span>
      )
    }

    // Parse the escape code
    const codes = match[1].split(';').filter(c => c !== '')

    if (codes.length === 0 || codes[0] === '0') {
      // Reset
      currentStyle = {}
    } else {
      // Apply codes
      for (const code of codes) {
        applyAnsiCode(currentStyle, code)
      }
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const textContent = text.substring(lastIndex)
    parts.push(
      <span key={parts.length} style={styleToCSS(currentStyle)}>
        {textContent}
      </span>
    )
  }

  return parts.length > 0 ? parts : text
}

/**
 * Apply an ANSI code to the current style
 */
function applyAnsiCode(style: AnsiStyle, code: string): void {
  const num = parseInt(code, 10)

  if (num === 0) {
    // Reset all
    Object.keys(style).forEach(key => delete style[key as keyof AnsiStyle])
  } else if (num === 1) {
    style.bold = true
  } else if (num === 2) {
    style.dim = true
  } else if (num === 3) {
    style.italic = true
  } else if (num === 4) {
    style.underline = true
  } else if (num === 22) {
    style.bold = false
    style.dim = false
  } else if (num === 23) {
    style.italic = false
  } else if (num === 24) {
    style.underline = false
  } else if (num >= 30 && num <= 37) {
    // Foreground color
    style.color = ANSI_COLORS[code]
  } else if (num >= 40 && num <= 47) {
    // Background color
    style.backgroundColor = ANSI_COLORS[code]
  } else if (num >= 90 && num <= 97) {
    // Bright foreground
    style.color = ANSI_COLORS[code]
  } else if (num >= 100 && num <= 107) {
    // Bright background
    style.backgroundColor = ANSI_COLORS[code]
  }
}

/**
 * Convert AnsiStyle to CSS properties
 */
function styleToCSS(style: AnsiStyle): React.CSSProperties {
  const css: React.CSSProperties = {}

  if (style.color) {
    css.color = style.color
  }

  if (style.backgroundColor) {
    css.backgroundColor = style.backgroundColor
  }

  if (style.bold) {
    css.fontWeight = 'bold'
  }

  if (style.dim) {
    css.opacity = 0.5
  }

  if (style.italic) {
    css.fontStyle = 'italic'
  }

  if (style.underline) {
    css.textDecoration = 'underline'
  }

  return css
}

/**
 * Strip ANSI codes from text (for copying plain text)
 */
export function stripAnsi(text: string): string {
  // Strip OSC sequences
  text = text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  text = text.replace(/\]133;[A-D](?:;[0-9]+)?\s*/g, '')

  // Strip ALL CSI sequences (colors, cursor movement, screen control, etc.)
  text = text.replace(/\x1b\[[\d;?]*[A-Za-z]/g, '')

  return text
}
