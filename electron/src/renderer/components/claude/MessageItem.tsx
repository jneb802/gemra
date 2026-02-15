import React from 'react'
import type { RowComponentProps } from 'react-window'
import type { ClaudeMessage, MessageMetadata } from '../../../shared/types'
import { MessageStatusIndicator } from './MessageStatusIndicator'

export interface MessageItemProps {
  messages: ClaudeMessage[]
  currentTurnMetadata?: MessageMetadata | null
}

export const MessageItem = ({
  ariaAttributes,
  index,
  style,
  messages,
  currentTurnMetadata,
}: RowComponentProps<MessageItemProps>) => {
  const message = messages[index]

  // Determine if this message should be grouped with previous
  const isGroupedWithPrevious = index > 0 && messages[index].role === messages[index - 1].role

  const isLastMessage = index === messages.length - 1
  const isStreaming =
    isLastMessage &&
    message.role === 'assistant' &&
    currentTurnMetadata &&
    !currentTurnMetadata.isComplete

  return (
    <div style={style} {...ariaAttributes}>
      <div
        className={`message message-${message.role}${
          isGroupedWithPrevious ? ' message-grouped' : ''
        }`}
      >
        <div className="message-content">{message.content}</div>

        {/* Live status for streaming message */}
        {message.role === 'assistant' && isStreaming && currentTurnMetadata && (
          <MessageStatusIndicator metadata={currentTurnMetadata} isLive />
        )}

        {/* Final status for completed message */}
        {message.role === 'assistant' && message.metadata?.isComplete && (
          <MessageStatusIndicator metadata={message.metadata} isLive={false} />
        )}
      </div>
    </div>
  )
}
