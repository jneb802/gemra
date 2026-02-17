import React from 'react'

interface ErrorMessageProps {
  message: string
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  if (!message) return null

  return (
    <div
      style={{
        padding: '8px 12px',
        backgroundColor: '#5a1e1e',
        borderRadius: '4px',
        fontSize: '13px',
        color: '#f48771',
      }}
    >
      {message}
    </div>
  )
}
