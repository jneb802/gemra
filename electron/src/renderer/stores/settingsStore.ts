import { create } from 'zustand'
import type { InputMode } from '../types/inputMode'

export interface TerminalSettings {
  fontFamily: string
  fontSize: number
  lineHeight: number
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  scrollback: number
  theme: 'dark' | 'light'
  useDocker: boolean
  defaultInputMode: InputMode
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
  useDocker: false,
  defaultInputMode: 'auto',
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
