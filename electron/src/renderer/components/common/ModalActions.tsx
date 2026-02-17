import React from 'react'

interface ModalActionsProps {
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
  canSubmit: boolean
  isLoading?: boolean
}

export const ModalActions: React.FC<ModalActionsProps> = ({
  onCancel,
  onSubmit,
  submitLabel,
  canSubmit,
  isLoading = false,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px',
        marginTop: '8px',
      }}
    >
      <button
        onClick={onCancel}
        disabled={isLoading}
        style={{
          padding: '8px 16px',
          backgroundColor: 'transparent',
          border: '1px solid #3e3e3e',
          borderRadius: '4px',
          color: '#d4d4d4',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        Cancel
      </button>
      <button
        onClick={onSubmit}
        disabled={!canSubmit || isLoading}
        style={{
          padding: '8px 16px',
          backgroundColor: canSubmit && !isLoading ? '#569cd6' : '#3e3e3e',
          border: 'none',
          borderRadius: '4px',
          color: canSubmit && !isLoading ? '#ffffff' : '#6e6e6e',
          cursor: canSubmit && !isLoading ? 'pointer' : 'not-allowed',
          fontSize: '13px',
          fontWeight: 500,
        }}
      >
        {submitLabel}
      </button>
    </div>
  )
}
