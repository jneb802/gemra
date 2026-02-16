import React from 'react'
import type { RowComponentProps } from 'react-window'
import type { ClaudeMessage, MessageMetadata, MessageContent } from '../../../shared/types'
import { MessageStatusIndicator } from './MessageStatusIndicator'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface MessageItemProps {
  messages: ClaudeMessage[]
  currentTurnMetadata?: MessageMetadata | null
}

// Filter out internal system tags from content
const sanitizeContent = (content: string): string => {
  // Remove XML-like tags that are internal to Claude SDK
  return content
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .trim()
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
      const sanitized = sanitizeContent(message.content)
      // Don't render if content is empty after sanitization
      if (!sanitized) return null

      return (
        <div className="message-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {sanitized}
          </ReactMarkdown>
        </div>
      )
    }

    // Multimodal content (array of blocks)
    return (
      <div className="message-content">
        {message.content.map((block: MessageContent, idx: number) => {
          if (block.type === 'text') {
            const sanitized = sanitizeContent(block.text)
            // Skip empty blocks after sanitization
            if (!sanitized) return null

            return (
              <div key={idx} style={{ marginBottom: idx < message.content.length - 1 ? '8px' : 0 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {sanitized}
                </ReactMarkdown>
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

  const content = renderContent()

  // Don't render message if content is null (empty after sanitization)
  if (!content) {
    return null
  }

  return (
    <div style={style} {...ariaAttributes}>
      <div
        className={`message message-${message.role}${
          isGroupedWithPrevious ? ' message-grouped' : ''
        }`}
      >
        {content}

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
