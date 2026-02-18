import React, { useEffect, useMemo, useRef, useState } from 'react'
import { List, useDynamicRowHeight, type ListImperativeAPI } from 'react-window'
import type { ClaudeMessage, MessageMetadata } from '../../../shared/types'
import { estimateMessageHeight, useMessageGrouping } from './useMessageHeights'
import { MessageItem, type MessageItemProps } from './MessageItem'

interface MessageListProps {
  messages: ClaudeMessage[]
  isStreaming?: boolean
  currentTurnMetadata?: MessageMetadata | null
  onRespondToQuest?: (questId: string, response: string | string[]) => void
  model?: string
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isStreaming = false,
  currentTurnMetadata,
  onRespondToQuest,
  model,
}) => {
  const listRef = useRef<ListImperativeAPI | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isUserScrolling, setIsUserScrolling] = useState(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout>()
  const [containerHeight, setContainerHeight] = useState(600)
  const isInitialMount = useRef(true)

  // Use message grouping helper
  const { isGroupedWithPrevious } = useMessageGrouping(messages)

  // Calculate default row height (average)
  const defaultRowHeight = useMemo(
    () => messages.length > 0 ? estimateMessageHeight(messages[0], false) : 100,
    [messages]
  )

  const messageKey = useMemo(
    () => messages.map(m => m.id).join('-'),
    [messages]
  )

  // Use dynamic row height for variable-sized rows
  const rowHeight = useDynamicRowHeight({
    defaultRowHeight,
    key: messageKey, // Re-initialize when messages change
  })

  // Measure container height
  useEffect(() => {
    if (containerRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerHeight(entry.contentRect.height)
        }
      })
      observer.observe(containerRef.current)

      // Set initial height
      setContainerHeight(containerRef.current.clientHeight)

      return () => observer.disconnect()
    }
  }, [])

  // Observe row elements for height measurement
  useEffect(() => {
    if (listRef.current?.element) {
      const rows = listRef.current.element.querySelectorAll('[role="listitem"]')
      if (rows.length > 0 && 'observeRowElements' in rowHeight) {
        const unobserve = rowHeight.observeRowElements(rows)
        return unobserve
      }
    }
  }, [messages, rowHeight, listRef.current])

  // Auto-scroll to bottom when streaming or user hasn't manually scrolled
  useEffect(() => {
    if ((isStreaming || !isUserScrolling) && messages.length > 0 && listRef.current) {
      // Use instant scroll on initial mount (tab switch), smooth scroll for updates
      const scrollBehavior = isInitialMount.current ? 'instant' : 'smooth'

      // Use requestAnimationFrame to ensure DOM updates are complete before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (listRef.current) {
            listRef.current.scrollToRow({
              index: messages.length - 1,
              align: 'end',
              behavior: scrollBehavior,
            })
            // Mark that initial mount is complete
            isInitialMount.current = false
          }
        })
      })
    }
  }, [messages.length, isStreaming, isUserScrolling])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  // Early return for empty state
  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        <div className="empty-state">
          <p>Start a conversation with Claude Code</p>
          <p className="hint">Try asking: "What files are in this directory?"</p>
        </div>
      </div>
    )
  }

  // Row props passed to each MessageItem
  const rowProps = useMemo<MessageItemProps>(() => ({
    messages,
    currentTurnMetadata,
    onRespondToQuest,
    model,
  }), [messages, currentTurnMetadata, onRespondToQuest, model])

  return (
    <div ref={containerRef} className="message-list">
      <List<MessageItemProps>
        listRef={listRef}
        rowComponent={MessageItem}
        rowCount={messages.length}
        rowHeight={rowHeight}
        rowProps={rowProps}
        overscanCount={3}
        style={{ height: containerHeight }}
      />
    </div>
  )
}
