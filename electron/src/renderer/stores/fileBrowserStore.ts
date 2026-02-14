import { create } from 'zustand'

interface FileBrowserState {
  isVisible: boolean
  sidebarWidth: number
  currentPath: string
  expandedDirs: Set<string>

  // Actions
  toggleVisibility: () => void
  setSidebarWidth: (width: number) => void
  setCurrentPath: (path: string) => void
  toggleDirectory: (path: string) => void
  isDirectoryExpanded: (path: string) => boolean
}

export const useFileBrowserStore = create<FileBrowserState>((set, get) => ({
  isVisible: true,
  sidebarWidth: 250,
  currentPath: '',
  expandedDirs: new Set(),

  toggleVisibility: () => {
    set((state) => ({ isVisible: !state.isVisible }))
  },

  setSidebarWidth: (width: number) => {
    // Constrain width between 150px and 500px
    const constrainedWidth = Math.max(150, Math.min(500, width))
    set({ sidebarWidth: constrainedWidth })
  },

  setCurrentPath: (path: string) => {
    set({ currentPath: path })
  },

  toggleDirectory: (path: string) => {
    set((state) => {
      const newExpandedDirs = new Set(state.expandedDirs)
      if (newExpandedDirs.has(path)) {
        newExpandedDirs.delete(path)
      } else {
        newExpandedDirs.add(path)
      }
      return { expandedDirs: newExpandedDirs }
    })
  },

  isDirectoryExpanded: (path: string) => {
    return get().expandedDirs.has(path)
  },
}))
