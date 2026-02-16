import { create } from 'zustand'
import type { InputMode, InputModeState } from '../types/inputMode'
import { INPUT_MODES } from '../types/inputMode'

export const useInputModeStore = create<InputModeState>((set, get) => ({
  globalMode: 'auto',
  tabModes: {},

  setGlobalMode: (mode: InputMode) => {
    set({ globalMode: mode })
  },

  setTabMode: (tabId: string, mode: InputMode) => {
    set((state) => ({
      tabModes: {
        ...state.tabModes,
        [tabId]: mode,
      },
    }))
  },

  getTabMode: (tabId: string): InputMode => {
    const state = get()
    return state.tabModes[tabId] || state.globalMode
  },

  cycleMode: (tabId?: string) => {
    const state = get()
    const currentMode = tabId ? state.tabModes[tabId] || state.globalMode : state.globalMode
    const currentIndex = INPUT_MODES.indexOf(currentMode)
    const nextMode = INPUT_MODES[(currentIndex + 1) % INPUT_MODES.length]

    if (tabId) {
      get().setTabMode(tabId, nextMode)
    } else {
      set({ globalMode: nextMode })
    }
  },
}))
