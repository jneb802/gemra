import { create } from 'zustand'
import type { TerminalBlock, TerminalBlockList, BlockStatus } from '../../shared/types/blocks'

interface BlockStore {
  // State
  blockLists: Map<string, TerminalBlockList>  // terminalId -> blocks

  // Getters
  getBlocks: (terminalId: string) => TerminalBlock[]
  getBlock: (terminalId: string, blockId: string) => TerminalBlock | undefined
  getActiveBlock: (terminalId: string) => TerminalBlock | undefined
  getBlocksByStatus: (terminalId: string, status: BlockStatus) => TerminalBlock[]

  // Block lifecycle
  createBlock: (terminalId: string, block: Partial<TerminalBlock>) => TerminalBlock
  updateBlock: (terminalId: string, blockId: string, updates: Partial<TerminalBlock>) => void
  deleteBlock: (terminalId: string, blockId: string) => void
  clearBlocks: (terminalId: string) => void

  // Block operations
  setActiveBlock: (terminalId: string, blockId: string) => void
  startBlockExecution: (terminalId: string, blockId: string) => void
  finishBlockExecution: (terminalId: string, blockId: string, exitCode: number) => void
  appendToBlock: (terminalId: string, blockId: string, content: string) => void

  // UI operations
  toggleBlockCollapse: (terminalId: string, blockId: string) => void
  selectBlock: (terminalId: string, blockId: string) => void
  deselectAll: (terminalId: string) => void
}

export const useBlockStore = create<BlockStore>((set, get) => ({
  blockLists: new Map(),

  getBlocks: (terminalId) => {
    const list = get().blockLists.get(terminalId)
    return list?.blocks || []
  },

  getBlock: (terminalId, blockId) => {
    const blocks = get().getBlocks(terminalId)
    return blocks.find(b => b.id === blockId)
  },

  getActiveBlock: (terminalId) => {
    const list = get().blockLists.get(terminalId)
    if (!list?.activeBlockId) return undefined
    return get().getBlock(terminalId, list.activeBlockId)
  },

  getBlocksByStatus: (terminalId, status) => {
    return get().getBlocks(terminalId).filter(b => b.status === status)
  },

  createBlock: (terminalId, blockData) => {
    const block: TerminalBlock = {
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      tabId: terminalId,
      type: blockData.type || 'command',
      status: blockData.status || 'pending',
      content: blockData.content || '',
      workingDir: blockData.workingDir || '~',
      collapsed: false,
      selected: false,
      startTime: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...blockData,
    }

    set((state) => {
      const lists = new Map(state.blockLists)
      const existing = lists.get(terminalId) || { terminalId, blocks: [], lastExitCode: 0 }
      lists.set(terminalId, { ...existing, blocks: [...existing.blocks, block] })
      return { blockLists: lists }
    })

    return block
  },

  updateBlock: (terminalId, blockId, updates) => {
    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (!list) return state

      const blockIndex = list.blocks.findIndex(b => b.id === blockId)
      if (blockIndex === -1) return state

      const newBlocks = list.blocks.slice()
      newBlocks[blockIndex] = {
        ...newBlocks[blockIndex],
        ...updates,
        updatedAt: Date.now(),
      }

      lists.set(terminalId, { ...list, blocks: newBlocks })
      return { blockLists: lists }
    })
  },

  startBlockExecution: (terminalId, blockId) => {
    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (!list) return state

      const blockIndex = list.blocks.findIndex(b => b.id === blockId)
      if (blockIndex === -1) return state

      const newBlocks = list.blocks.slice()
      newBlocks[blockIndex] = {
        ...newBlocks[blockIndex],
        status: 'running',
        startTime: Date.now(),
        updatedAt: Date.now(),
      }

      lists.set(terminalId, { ...list, blocks: newBlocks, activeBlockId: blockId })
      return { blockLists: lists }
    })
  },

  finishBlockExecution: (terminalId, blockId, exitCode) => {
    const endTime = Date.now()

    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (!list) return state

      const newBlocks = list.blocks.map(b => {
        if (b.id !== blockId) return b
        return {
          ...b,
          status: (exitCode === 0 ? 'completed' : 'failed') as BlockStatus,
          exitCode,
          endTime,
          duration: endTime - b.startTime,
          updatedAt: endTime,
        }
      })

      lists.set(terminalId, {
        ...list,
        blocks: newBlocks,
        activeBlockId: undefined,
        lastExitCode: exitCode,
      })
      return { blockLists: lists }
    })
  },

  appendToBlock: (terminalId, blockId, content) => {
    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (!list) return state

      const blockIndex = list.blocks.findIndex(b => b.id === blockId)
      if (blockIndex === -1) return state

      const newBlocks = list.blocks.slice()
      newBlocks[blockIndex] = {
        ...newBlocks[blockIndex],
        content: newBlocks[blockIndex].content + content,
        updatedAt: Date.now(),
      }

      lists.set(terminalId, { ...list, blocks: newBlocks })
      return { blockLists: lists }
    })
  },

  setActiveBlock: (terminalId, blockId) => {
    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (!list) return state
      lists.set(terminalId, { ...list, activeBlockId: blockId })
      return { blockLists: lists }
    })
  },

  toggleBlockCollapse: (terminalId, blockId) => {
    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (!list) return state

      const blockIndex = list.blocks.findIndex(b => b.id === blockId)
      if (blockIndex === -1) return state

      const newBlocks = list.blocks.slice()
      newBlocks[blockIndex] = {
        ...newBlocks[blockIndex],
        collapsed: !newBlocks[blockIndex].collapsed,
        updatedAt: Date.now(),
      }

      lists.set(terminalId, { ...list, blocks: newBlocks })
      return { blockLists: lists }
    })
  },

  selectBlock: (terminalId, blockId) => {
    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (!list) return state

      const newBlocks = list.blocks.map(b => ({
        ...b,
        selected: b.id === blockId,
        updatedAt: b.id === blockId || b.selected ? Date.now() : b.updatedAt,
      }))

      lists.set(terminalId, { ...list, blocks: newBlocks })
      return { blockLists: lists }
    })
  },

  deselectAll: (terminalId) => {
    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (!list) return state

      const hasSelected = list.blocks.some(b => b.selected)
      if (!hasSelected) return state

      const newBlocks = list.blocks.map(b =>
        b.selected ? { ...b, selected: false, updatedAt: Date.now() } : b
      )

      lists.set(terminalId, { ...list, blocks: newBlocks })
      return { blockLists: lists }
    })
  },

  deleteBlock: (terminalId, blockId) => {
    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (!list) return state

      lists.set(terminalId, { ...list, blocks: list.blocks.filter(b => b.id !== blockId) })
      return { blockLists: lists }
    })
  },

  clearBlocks: (terminalId) => {
    set((state) => {
      const lists = new Map(state.blockLists)
      lists.set(terminalId, { terminalId, blocks: [], lastExitCode: 0 })
      return { blockLists: lists }
    })
  },
}))
