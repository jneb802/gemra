import React from 'react'
import type { RowComponentProps } from 'react-window'
import type { ClaudeMessage, MessageMetadata, MessageContent } from '../../../shared/types'
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

  // Render message content (handles both string and multimodal)
  const renderContent = () => {
    if (typeof message.content === 'string') {
      return <div className="message-content">{message.content}</div>
    }

    // Multimodal content (array of blocks)
    return (
      <div className="message-content">
        {message.content.map((block: MessageContent, idx: number) => {
          if (block.type === 'text') {
            return (
              <div key={idx} style={{ marginBottom: idx < message.content.length - 1 ? '8px' : 0 }}>
                {block.text}
              </div>
            )
          }

          if (block.type === 'image') {
            return (
              <img
                key={idx}
                src={`data:${block.source.media_type};base64,${block.source.data}`}
                alt="Attached image"
                style={{
                  maxWidth: '100%',
                  maxHeight: '400px',
                  borderRadius: '8px',
                  marginBottom: idx < message.content.length - 1 ? '8px' : 0,
                }}
              />
            )
          }

          return null
        })}
      </div>
    )
  }

  return (
    <div style={style} {...ariaAttributes}>
      <div
        className={`message message-${message.role}${
          isGroupedWithPrevious ? ' message-grouped' : ''
        }`}
      >
        {renderContent()}

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
