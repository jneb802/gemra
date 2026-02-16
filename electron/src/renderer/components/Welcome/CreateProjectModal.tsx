import React, { useState } from 'react'
import { X, FolderOpen } from 'lucide-react'
import * as path from 'path'

interface CreateProjectModalProps {
  onClose: () => void
  onCreate: (name: string, location: string, initGit: boolean) => void
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ onClose, onCreate }) => {
  // Default location - users can browse to change
  const defaultLocation = window.electron.platform === 'darwin'
    ? '/Users'
    : window.electron.platform === 'win32'
    ? 'C:\\'
    : '/home'
  const [projectName, setProjectName] = useState('')
  const [location, setLocation] = useState(defaultLocation)
  const [initGit, setInitGit] = useState(false)
  const [error, setError] = useState('')

  const handleBrowse = async () => {
    const selectedPath = await window.electron.dialog.selectDirectory()
    if (selectedPath) {
      setLocation(selectedPath)
    }
  }

  const handleCreate = async () => {
    if (!projectName.trim()) {
      setError('Project name is required')
      return
    }

    const targetPath = path.join(location, projectName.trim())

    // Check if directory already exists
    const exists = await window.electron.dialog.checkDirectory(targetPath)
    if (exists) {
      setError('A directory with this name already exists')
      return
    }

    onCreate(projectName.trim(), location, initGit)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && projectName.trim()) {
      handleCreate()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#2d2d2d',
          borderRadius: '8px',
          padding: '24px',
          width: '500px',
          maxWidth: '90vw',
          border: '1px solid #3e3e3e'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#d4d4d4' }}>Create Project</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#8e8e8e',
              padding: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Project Name */}
          <div>
            <label
              htmlFor="projectName"
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '13px',
                color: '#d4d4d4'
              }}
            >
              Project Name
            </label>
            <input
              id="projectName"
              type="text"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              placeholder="my-project"
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #3e3e3e',
                borderRadius: '4px',
                color: '#d4d4d4',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          {/* Location */}
          <div>
            <label
              htmlFor="location"
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '13px',
                color: '#d4d4d4'
              }}
            >
              Location
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  backgroundColor: '#1e1e1e',
                  border: '1px solid #3e3e3e',
                  borderRadius: '4px',
                  color: '#d4d4d4',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              <button
                onClick={handleBrowse}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#3e3e3e',
                  border: '1px solid #505050',
                  borderRadius: '4px',
                  color: '#d4d4d4',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '13px'
                }}
              >
                <FolderOpen size={16} />
                Browse
              </button>
            </div>
          </div>

          {/* Git Init Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="initGit"
              checked={initGit}
              onChange={(e) => setInitGit(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label
              htmlFor="initGit"
              style={{
                fontSize: '13px',
                color: '#d4d4d4',
                cursor: 'pointer'
              }}
            >
              Initialize git repository
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{ padding: '8px 12px', backgroundColor: '#5a1e1e', borderRadius: '4px', fontSize: '13px', color: '#f48771' }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                border: '1px solid #3e3e3e',
                borderRadius: '4px',
                color: '#d4d4d4',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!projectName.trim()}
              style={{
                padding: '8px 16px',
                backgroundColor: projectName.trim() ? '#569cd6' : '#3e3e3e',
                border: 'none',
                borderRadius: '4px',
                color: projectName.trim() ? '#ffffff' : '#6e6e6e',
                cursor: projectName.trim() ? 'pointer' : 'not-allowed',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
