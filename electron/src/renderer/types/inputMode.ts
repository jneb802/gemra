/**
 * Input mode types for Command/AI toggle
 */

export type InputMode = 'auto' | 'command' | 'ai'
export type DetectedType = 'command' | 'ai'

export interface InputModeState {
  // Global default mode
  globalMode: InputMode

  // Per-tab mode overrides
  tabModes: Record<string, InputMode>

  // Actions
  setGlobalMode: (mode: InputMode) => void
  setTabMode: (tabId: string, mode: InputMode) => void
  getTabMode: (tabId: string) => InputMode
  cycleMode: (tabId?: string) => void
}

// Mode constants
export const INPUT_MODES: InputMode[] = ['auto', 'command', 'ai']

// Mode display names
export const MODE_LABELS: Record<InputMode, string> = {
  auto: 'Auto',
  command: 'Command',
  ai: 'AI',
}

// Mode icons
export const MODE_ICONS: Record<InputMode, string> = {
  auto: '🔄',
  command: '💻',
  ai: '🤖',
}
