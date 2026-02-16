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

// Compact chip that goes inside the input field
interface CompactImageChipProps {
  images: AttachedImage[]
  onRemove: () => void
}

export const CompactImageChip: React.FC<CompactImageChipProps> = ({ images, onRemove }) => {
  if (images.length === 0) return null

  const firstImage = images[0]
  const hasMultiple = images.length > 1

  return (
    <div
      style={{
        position: 'absolute',
        right: '76px', // Position before the send button (12px padding + 64px button width)
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        backgroundColor: '#2a2a2a',
        border: '1px solid #3a3a3a',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#d4d4d4',
        zIndex: 10,
      }}
    >
      {/* Thumbnail */}
      <img
        src={firstImage.dataUrl}
        alt={firstImage.name}
        style={{
          width: '24px',
          height: '24px',
          objectFit: 'cover',
          borderRadius: '4px',
          flexShrink: 0,
        }}
      />

      {/* Count for multiple images */}
      {hasMultiple && (
        <span
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: '#888',
          }}
        >
          +{images.length - 1}
        </span>
      )}

      {/* Remove button */}
      <button
        onClick={onRemove}
        style={{
          background: 'none',
          border: 'none',
          color: '#888',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '3px',
          flexShrink: 0,
          fontSize: '14px',
          lineHeight: 1,
          marginLeft: '2px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#d4d4d4'
          e.currentTarget.style.backgroundColor = '#3a3a3a'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#888'
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
        title={`Remove ${images.length} image${images.length > 1 ? 's' : ''}`}
      >
        ×
      </button>
    </div>
  )
}
