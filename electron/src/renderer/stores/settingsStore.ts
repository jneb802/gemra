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
  openRouterApiKey: string
}

interface SettingsState extends TerminalSettings {
  // Actions
  updateSettings: (settings: Partial<TerminalSettings>) => void
  resetToDefaults: () => void
}

const STORAGE_KEY = 'gemra-settings'

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
  openRouterApiKey: '',
}

function loadFromStorage(): TerminalSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveToStorage(settings: TerminalSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.error('[settingsStore] Failed to save settings:', err)
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadFromStorage(),

  updateSettings: (newSettings) => {
    set((state) => {
      const updated = { ...state, ...newSettings }
      saveToStorage(updated)
      return updated
    })
  },

  resetToDefaults: () => {
    saveToStorage(DEFAULT_SETTINGS)
    set(DEFAULT_SETTINGS)
  },
}))
