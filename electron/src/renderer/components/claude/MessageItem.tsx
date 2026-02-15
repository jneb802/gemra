import React from 'react'
import type { RowComponentProps } from 'react-window'
import type { ClaudeMessage } from '../../../shared/types'

export interface MessageItemProps {
  messages: ClaudeMessage[]
}

export const MessageItem = ({ ariaAttributes, index, style, messages }: RowComponentProps<MessageItemProps>) => {
  const message = messages[index]

  // Determine if this message should be grouped with previous
  const isGroupedWithPrevious = index > 0 && messages[index].role === messages[index - 1].role

  return (
    <div style={style} {...ariaAttributes}>
      <div
        className={`message message-${message.role}${
          isGroupedWithPrevious ? ' message-grouped' : ''
        }`}
      >
        <div className="message-content">{message.content}</div>
      </div>
    </div>
  )
}
