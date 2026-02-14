import { create } from 'zustand'

export interface TerminalSettings {
  fontFamily: string
  fontSize: number
  lineHeight: number
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  scrollback: number
  theme: 'dark' | 'light'
}

interface SettingsState extends TerminalSettings {
  // Actions
  updateSettings: (settings: Partial<TerminalSettings>) => void
  resetToDefaults: () => void
}

const DEFAULT_SETTINGS: TerminalSettings = {
  fontFamily: 'Monaco, Menlo, Consolas, "Courier New", monospace',
  fontSize: 14,
  lineHeight: 1.2,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  theme: 'dark',
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,

  updateSettings: (newSettings) => {
    set((state) => ({
      ...state,
      ...newSettings,
    }))
  },

  resetToDefaults: () => {
    set(DEFAULT_SETTINGS)
  },
}))
