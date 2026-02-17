import React from 'react'
import { FolderOpen } from 'lucide-react'

interface LocationPickerProps {
  label?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  label = 'Location',
  value,
  onChange,
  disabled = false,
}) => {
  const handleBrowse = async () => {
    const result = await window.electron.dialog.selectDirectory()
    if (result.success && result.path) {
      onChange(result.path)
    }
  }

  return (
    <div>
      <label
        htmlFor="location"
        style={{
          display: 'block',
          marginBottom: '6px',
          fontSize: '13px',
          color: '#d4d4d4',
        }}
      >
        {label}
      </label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          id="location"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            flex: 1,
            padding: '8px 12px',
            backgroundColor: '#1e1e1e',
            border: '1px solid #3e3e3e',
            borderRadius: '4px',
            color: '#d4d4d4',
            fontSize: '13px',
            outline: 'none',
            opacity: disabled ? 0.6 : 1,
          }}
        />
        <button
          onClick={handleBrowse}
          disabled={disabled}
          style={{
            padding: '8px 12px',
            backgroundColor: '#3e3e3e',
            border: '1px solid #505050',
            borderRadius: '4px',
            color: '#d4d4d4',
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '13px',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <FolderOpen size={16} />
          Browse
        </button>
      </div>
    </div>
  )
}
