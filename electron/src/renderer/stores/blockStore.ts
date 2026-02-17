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
      const list = lists.get(terminalId) || { terminalId, blocks: [], lastExitCode: 0 }
      list.blocks.push(block)
      lists.set(terminalId, list)
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

      list.blocks[blockIndex] = {
        ...list.blocks[blockIndex],
        ...updates,
        updatedAt: Date.now(),
      }

      lists.set(terminalId, list)
      return { blockLists: lists }
    })
  },

  startBlockExecution: (terminalId, blockId) => {
    get().updateBlock(terminalId, blockId, {
      status: 'running',
      startTime: Date.now(),
    })

    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (list) {
        list.activeBlockId = blockId
        lists.set(terminalId, list)
      }
      return { blockLists: lists }
    })
  },

  finishBlockExecution: (terminalId, blockId, exitCode) => {
    const endTime = Date.now()
    const block = get().getBlock(terminalId, blockId)

    get().updateBlock(terminalId, blockId, {
      status: exitCode === 0 ? 'completed' : 'failed',
      exitCode,
      endTime,
      duration: block ? endTime - block.startTime : 0,
    })

    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (list) {
        list.activeBlockId = undefined
        list.lastExitCode = exitCode
        lists.set(terminalId, list)
      }
      return { blockLists: lists }
    })
  },

  appendToBlock: (terminalId, blockId, content) => {
    const block = get().getBlock(terminalId, blockId)
    if (!block) return

    get().updateBlock(terminalId, blockId, {
      content: block.content + content,
    })
  },

  setActiveBlock: (terminalId, blockId) => {
    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (list) {
        list.activeBlockId = blockId
        lists.set(terminalId, list)
      }
      return { blockLists: lists }
    })
  },

  toggleBlockCollapse: (terminalId, blockId) => {
    const block = get().getBlock(terminalId, blockId)
    if (!block) return

    get().updateBlock(terminalId, blockId, {
      collapsed: !block.collapsed,
    })
  },

  selectBlock: (terminalId, blockId) => {
    get().deselectAll(terminalId)
    get().updateBlock(terminalId, blockId, { selected: true })
  },

  deselectAll: (terminalId) => {
    const blocks = get().getBlocks(terminalId)
    blocks.forEach(block => {
      if (block.selected) {
        get().updateBlock(terminalId, block.id, { selected: false })
      }
    })
  },

  deleteBlock: (terminalId, blockId) => {
    set((state) => {
      const lists = new Map(state.blockLists)
      const list = lists.get(terminalId)
      if (!list) return state

      list.blocks = list.blocks.filter(b => b.id !== blockId)
      lists.set(terminalId, list)
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
