import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { TerminalView } from '../Terminal/TerminalView'
import type { LayoutNode, PaneNode, SplitNode } from '../../stores/layoutStore'

interface SplitLayoutProps {
  layout: LayoutNode
  onPaneClick: (paneId: string) => void
}

export function SplitLayout({ layout, onPaneClick }: SplitLayoutProps) {
  return <LayoutNodeRenderer node={layout} onPaneClick={onPaneClick} />
}

interface LayoutNodeRendererProps {
  node: LayoutNode
  onPaneClick: (paneId: string) => void
}

function LayoutNodeRenderer({ node, onPaneClick }: LayoutNodeRendererProps) {
  if (node.type === 'pane') {
    return <PaneRenderer pane={node} onPaneClick={onPaneClick} />
  }

  return <SplitRenderer split={node} onPaneClick={onPaneClick} />
}

interface PaneRendererProps {
  pane: PaneNode
  onPaneClick: (paneId: string) => void
}

function PaneRenderer({ pane, onPaneClick }: PaneRendererProps) {
  return (
    <div
      onClick={() => onPaneClick(pane.id)}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        border: pane.isActive ? '2px solid #007acc' : '2px solid transparent',
        boxSizing: 'border-box',
      }}
    >
      <TerminalView terminalId={pane.terminalId} />
    </div>
  )
}

interface SplitRendererProps {
  split: SplitNode
  onPaneClick: (paneId: string) => void
}

function SplitRenderer({ split, onPaneClick }: SplitRendererProps) {
  const direction = split.direction === 'horizontal' ? 'horizontal' : 'vertical'

  return (
    <PanelGroup direction={direction}>
      <Panel defaultSize={50} minSize={10}>
        <LayoutNodeRenderer node={split.children[0]} onPaneClick={onPaneClick} />
      </Panel>

      <PanelResizeHandle
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1e1e1e',
          transition: 'background-color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          const target = e.currentTarget as unknown as HTMLElement
          target.style.backgroundColor = '#3e3e3e'
        }}
        onMouseLeave={(e) => {
          const target = e.currentTarget as unknown as HTMLElement
          target.style.backgroundColor = '#1e1e1e'
        }}
      >
        <div
          style={{
            width: direction === 'horizontal' ? '2px' : '100%',
            height: direction === 'vertical' ? '2px' : '100%',
            backgroundColor: '#3e3e3e',
          }}
        />
      </PanelResizeHandle>

      <Panel defaultSize={50} minSize={10}>
        <LayoutNodeRenderer node={split.children[1]} onPaneClick={onPaneClick} />
      </Panel>
    </PanelGroup>
  )
}
