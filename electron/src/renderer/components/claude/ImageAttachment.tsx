import React from 'react'

export interface AttachedImage {
  id: string
  name: string
  mimeType: string
  dataUrl: string  // base64-encoded data URL for preview
  size: number
}

interface ImageAttachmentProps {
  image: AttachedImage
  onRemove: () => void
}

export const ImageAttachment: React.FC<ImageAttachmentProps> = ({ image, onRemove }) => {
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
        backgroundColor: '#2a2a2a',
        border: '1px solid #3a3a3a',
        borderRadius: '6px',
        fontSize: '13px',
        color: '#d4d4d4',
        maxWidth: '200px',
      }}
    >
      {/* Thumbnail */}
      <img
        src={image.dataUrl}
        alt={image.name}
        style={{
          width: '32px',
          height: '32px',
          objectFit: 'cover',
          borderRadius: '4px',
          flexShrink: 0,
        }}
      />

      {/* File info */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          minWidth: 0,
          flex: 1,
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {image.name}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: '#888',
          }}
        >
          {formatFileSize(image.size)}
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        style={{
          background: 'none',
          border: 'none',
          color: '#888',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          flexShrink: 0,
          fontSize: '16px',
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#d4d4d4'
          e.currentTarget.style.backgroundColor = '#3a3a3a'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#888'
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
        title="Remove image"
      >
        ×
      </button>
    </div>
  )
}
