import { create } from 'zustand'

export type SplitDirection = 'horizontal' | 'vertical'

export interface PaneNode {
  id: string
  type: 'pane'
  terminalId: string
  isActive: boolean
}

export interface SplitNode {
  id: string
  type: 'split'
  direction: SplitDirection
  children: [LayoutNode, LayoutNode]
  isActive: boolean
}

export type LayoutNode = PaneNode | SplitNode

interface LayoutState {
  // Layouts per tab (tab ID -> layout tree)
  layouts: Map<string, LayoutNode>

  // Currently active pane ID per tab
  activePaneIds: Map<string, string>

  // Actions
  getLayout: (tabId: string) => LayoutNode | undefined
  setLayout: (tabId: string, layout: LayoutNode) => void
  getActivePaneId: (tabId: string) => string | undefined
  setActivePaneId: (tabId: string, paneId: string) => void

  // Pane operations
  splitPane: (tabId: string, paneId: string, direction: SplitDirection, newTerminalId: string) => void
  closePane: (tabId: string, paneId: string) => void
}

let nodeCounter = 0

function createPaneNode(terminalId: string, isActive = false): PaneNode {
  return {
    id: `pane-${++nodeCounter}`,
    type: 'pane',
    terminalId,
    isActive,
  }
}

function createSplitNode(
  direction: SplitDirection,
  children: [LayoutNode, LayoutNode]
): SplitNode {
  return {
    id: `split-${++nodeCounter}`,
    type: 'split',
    direction,
    children,
    isActive: false,
  }
}

function findPaneNode(node: LayoutNode, paneId: string): PaneNode | null {
  if (node.type === 'pane') {
    return node.id === paneId ? node : null
  }

  for (const child of node.children) {
    const found = findPaneNode(child, paneId)
    if (found) return found
  }

  return null
}

function getAllPaneNodes(node: LayoutNode): PaneNode[] {
  if (node.type === 'pane') {
    return [node]
  }

  return [...getAllPaneNodes(node.children[0]), ...getAllPaneNodes(node.children[1])]
}

function replacePaneNode(
  node: LayoutNode,
  paneId: string,
  newNode: LayoutNode
): LayoutNode {
  if (node.type === 'pane') {
    return node.id === paneId ? newNode : node
  }

  return {
    ...node,
    children: [
      replacePaneNode(node.children[0], paneId, newNode),
      replacePaneNode(node.children[1], paneId, newNode),
    ] as [LayoutNode, LayoutNode],
  }
}

function removePaneNode(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.type === 'pane') {
    return node.id === paneId ? null : node
  }

  const leftResult = removePaneNode(node.children[0], paneId)
  const rightResult = removePaneNode(node.children[1], paneId)

  // If one child was removed, return the other child
  if (leftResult === null) return rightResult
  if (rightResult === null) return leftResult

  // Both children exist, return the split
  return {
    ...node,
    children: [leftResult, rightResult],
  }
}

function setActiveInNode(node: LayoutNode, activePaneId: string): LayoutNode {
  if (node.type === 'pane') {
    return { ...node, isActive: node.id === activePaneId }
  }

  return {
    ...node,
    children: [
      setActiveInNode(node.children[0], activePaneId),
      setActiveInNode(node.children[1], activePaneId),
    ] as [LayoutNode, LayoutNode],
  }
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layouts: new Map(),
  activePaneIds: new Map(),

  getLayout: (tabId: string) => {
    return get().layouts.get(tabId)
  },

  setLayout: (tabId: string, layout: LayoutNode) => {
    set((state) => {
      const newLayouts = new Map(state.layouts)
      newLayouts.set(tabId, layout)
      return { layouts: newLayouts }
    })
  },

  getActivePaneId: (tabId: string) => {
    return get().activePaneIds.get(tabId)
  },

  setActivePaneId: (tabId: string, paneId: string) => {
    set((state) => {
      const newActivePaneIds = new Map(state.activePaneIds)
      newActivePaneIds.set(tabId, paneId)

      // Update layout to mark active pane
      const layout = state.layouts.get(tabId)
      if (layout) {
        const newLayout = setActiveInNode(layout, paneId)
        const newLayouts = new Map(state.layouts)
        newLayouts.set(tabId, newLayout)
        return { activePaneIds: newActivePaneIds, layouts: newLayouts }
      }

      return { activePaneIds: newActivePaneIds }
    })
  },

  splitPane: (tabId: string, paneId: string, direction: SplitDirection, newTerminalId: string) => {
    const state = get()
    const layout = state.layouts.get(tabId)

    if (!layout) {
      // Create initial layout with two panes
      const leftPane = createPaneNode(paneId, false)
      const rightPane = createPaneNode(newTerminalId, true)
      const splitNode = createSplitNode(direction, [leftPane, rightPane])

      state.setLayout(tabId, splitNode)
      state.setActivePaneId(tabId, rightPane.id)
      return
    }

    // Find the pane to split
    const paneNode = findPaneNode(layout, paneId)
    if (!paneNode) return

    // Create new split node
    const leftPane: PaneNode = { ...paneNode, isActive: false }
    const rightPane = createPaneNode(newTerminalId, true)
    const splitNode = createSplitNode(direction, [leftPane, rightPane])

    // Replace the pane with the split
    const newLayout = replacePaneNode(layout, paneId, splitNode)
    state.setLayout(tabId, newLayout)
    state.setActivePaneId(tabId, rightPane.id)
  },

  closePane: (tabId: string, paneId: string) => {
    const state = get()
    const layout = state.layouts.get(tabId)

    if (!layout) return

    // Remove the pane
    const newLayout = removePaneNode(layout, paneId)

    if (!newLayout) {
      // Last pane was closed, remove the layout
      const newLayouts = new Map(state.layouts)
      newLayouts.delete(tabId)
      const newActivePaneIds = new Map(state.activePaneIds)
      newActivePaneIds.delete(tabId)
      set({ layouts: newLayouts, activePaneIds: newActivePaneIds })
      return
    }

    // Update active pane if the closed pane was active
    const activePaneId = state.activePaneIds.get(tabId)
    if (activePaneId === paneId) {
      const allPanes = getAllPaneNodes(newLayout)
      if (allPanes.length > 0) {
        state.setActivePaneId(tabId, allPanes[0].id)
      }
    }

    state.setLayout(tabId, newLayout)
  },
}))
