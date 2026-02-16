import { create } from 'zustand'

export interface RecentDirectory {
  id: string
  path: string
  name: string
  timestamp: number
  gitBranch?: string
  gitStatus?: 'clean' | 'dirty'
}

interface RecentStore {
  items: RecentDirectory[]
  addRecent: (path: string, gitBranch?: string) => void
  removeRecent: (id: string) => void
  getRecent: () => RecentDirectory[]
}

const STORAGE_KEY = 'gemra:recent-directories'
const MAX_RECENT = 10

// Load from localStorage
const loadFromStorage = (): RecentDirectory[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Failed to load recent directories:', error)
    return []
  }
}

// Save to localStorage
const saveToStorage = (items: RecentDirectory[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch (error) {
    console.error('Failed to save recent directories:', error)
  }
}

export const useRecentStore = create<RecentStore>((set, get) => ({
  items: loadFromStorage(),

  addRecent: (path: string, gitBranch?: string) => {
    const items = get().items
    const name = path.split('/').pop() || path
    const id = `${path}-${Date.now()}`

    // Remove existing entry for this path
    const filtered = items.filter(item => item.path !== path)

    // Add new entry at the beginning
    const newItem: RecentDirectory = {
      id,
      path,
      name,
      timestamp: Date.now(),
      gitBranch
    }

    const newItems = [newItem, ...filtered].slice(0, MAX_RECENT)

    set({ items: newItems })
    saveToStorage(newItems)
  },

  removeRecent: (id: string) => {
    const items = get().items
    const newItems = items.filter(item => item.id !== id)

    set({ items: newItems })
    saveToStorage(newItems)
  },

  getRecent: () => {
    return get().items.sort((a, b) => b.timestamp - a.timestamp)
  }
}))
