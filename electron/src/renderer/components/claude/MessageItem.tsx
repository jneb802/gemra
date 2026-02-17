import React from 'react'
import type { RowComponentProps } from 'react-window'
import type { ClaudeMessage, MessageMetadata, MessageContent } from '../../../shared/types'
import { MessageStatusIndicator } from './MessageStatusIndicator'
import { ToolCallBlock } from './ToolCallBlock'
import { QuestPrompt } from './QuestPrompt'

export interface MessageItemProps {
  messages: ClaudeMessage[]
  currentTurnMetadata?: MessageMetadata | null
  onRespondToQuest?: (questId: string, response: string | string[]) => void
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
  onRespondToQuest,
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

  // Check if this is a quest prompt message
  const isQuestPrompt = !!message.questPrompt
  const isQuestAnswered = !!message.questResponse

  // Render message content (handles both string and multimodal)
  const renderContent = () => {
    if (typeof message.content === 'string') {
      const sanitized = sanitizeContent(message.content)
      // Don't render if content is empty after sanitization
      if (!sanitized) return null

      return { text: <div className="message-content">{sanitized}</div>, images: [] }
    }

    // Multimodal content (array of blocks)
    const textBlocks: JSX.Element[] = []
    const imageBlocks: JSX.Element[] = []

    message.content.forEach((block: MessageContent, idx: number) => {
      if (block.type === 'text') {
        const sanitized = sanitizeContent(block.text)
        // Skip empty blocks after sanitization
        if (!sanitized) return

        textBlocks.push(
          <div key={idx} style={{ marginBottom: textBlocks.length > 0 ? '8px' : 0 }}>
            {sanitized}
          </div>
        )
      }

      if (block.type === 'image') {
        imageBlocks.push(
          <img
            key={idx}
            src={`data:${block.source.media_type};base64,${block.source.data}`}
            alt="Attached image"
            style={{
              width: '32px',
              height: '32px',
              objectFit: 'cover',
              borderRadius: '4px',
            }}
          />
        )
      }
    })

    return {
      text: textBlocks.length > 0 ? <div className="message-content">{textBlocks}</div> : null,
      images: imageBlocks,
    }
  }

  const content = renderContent()

  // Get metadata - use live currentTurnMetadata if streaming, otherwise use message.metadata
  const metadata = isStreaming ? currentTurnMetadata : message.metadata

  // Don't render message if content is null (empty after sanitization) AND no tool calls AND not a quest
  if (!isQuestPrompt && (!content || (!content.text && content.images.length === 0 && !metadata?.toolCalls?.length))) {
    return null
  }

  return (
    <div style={style} {...ariaAttributes}>
      <div
        className={`message message-${message.role}${
          isGroupedWithPrevious ? ' message-grouped' : ''
        }${isQuestPrompt ? ' message-quest' : ''}`}
      >
        {!isQuestPrompt && content && content.text}

        {/* Quest prompt - interactive question UI */}
        {isQuestPrompt && message.questPrompt && !isQuestAnswered && onRespondToQuest && (
          <QuestPrompt
            questPrompt={message.questPrompt}
            onRespond={(response) => onRespondToQuest(message.id, response)}
            isLoading={false}
          />
        )}

        {/* Quest response - show what user answered */}
        {isQuestPrompt && isQuestAnswered && (
          <div className="quest-response">
            <div className="quest-response-label">Response:</div>
            <div className="quest-response-value">
              {Array.isArray(message.questResponse)
                ? message.questResponse.join(', ')
                : message.questResponse}
            </div>
          </div>
        )}

        {/* Image attachments list (shown below text for user messages) */}
        {!isQuestPrompt && message.role === 'user' && content && content.images.length > 0 && (
          <div className="message-attachments">
            {content.images}
          </div>
        )}

        {/* Tool calls - show for assistant messages */}
        {!isQuestPrompt && message.role === 'assistant' && metadata?.toolCalls && metadata.toolCalls.length > 0 && (
          <div className="tool-calls-container">
            {metadata.toolCalls.map((toolCall) => (
              <ToolCallBlock
                key={toolCall.id}
                toolCall={toolCall}
                isStreaming={!!isStreaming && toolCall.status === 'running'}
              />
            ))}
          </div>
        )}

        {/* Live status for streaming message */}
        {!isQuestPrompt && message.role === 'assistant' && isStreaming && currentTurnMetadata && (
          <MessageStatusIndicator metadata={currentTurnMetadata} isLive />
        )}

        {/* Final status for completed message */}
        {!isQuestPrompt && message.role === 'assistant' && message.metadata?.isComplete && (
          <MessageStatusIndicator metadata={message.metadata} isLive={false} />
        )}
      </div>
    </div>
  )
}
