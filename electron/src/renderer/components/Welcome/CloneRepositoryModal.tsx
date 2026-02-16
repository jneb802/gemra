import React, { useState } from 'react'
import { X, FolderOpen } from 'lucide-react'
import * as path from 'path'

interface CloneRepositoryModalProps {
  onClose: () => void
  onClone: (url: string, targetPath: string) => void
}

export const CloneRepositoryModal: React.FC<CloneRepositoryModalProps> = ({ onClose, onClone }) => {
  // Default location - users can browse to change
  const defaultLocation = window.electron.platform === 'darwin'
    ? '/Users'
    : window.electron.platform === 'win32'
    ? 'C:\\'
    : '/home'
  const [gitUrl, setGitUrl] = useState('')
  const [location, setLocation] = useState(defaultLocation)
  const [isCloning, setIsCloning] = useState(false)
  const [error, setError] = useState('')

  const handleBrowse = async () => {
    const selectedPath = await window.electron.dialog.selectDirectory()
    if (selectedPath) {
      setLocation(selectedPath)
    }
  }

  const validateGitUrl = (url: string): boolean => {
    // Basic git URL validation
    const patterns = [
      /^https?:\/\/.+\.git$/,
      /^git@.+:.+\.git$/,
      /^https?:\/\/github\.com\/.+\/.+$/,
      /^https?:\/\/gitlab\.com\/.+\/.+$/,
      /^https?:\/\/bitbucket\.org\/.+\/.+$/
    ]
    return patterns.some(pattern => pattern.test(url))
  }

  const handleClone = async () => {
    if (!gitUrl.trim()) {
      setError('Git URL is required')
      return
    }

    if (!validateGitUrl(gitUrl.trim())) {
      setError('Invalid git URL format')
      return
    }

    // Extract repo name from URL
    const urlParts = gitUrl.trim().split('/')
    const repoNameWithGit = urlParts[urlParts.length - 1]
    const repoName = repoNameWithGit.replace('.git', '')
    const targetPath = path.join(location, repoName)

    // Check if directory already exists
    const exists = await window.electron.dialog.checkDirectory(targetPath)
    if (exists) {
      setError('A directory with this name already exists')
      return
    }

    setIsCloning(true)
    setError('')

    try {
      await onClone(gitUrl.trim(), targetPath)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone repository')
      setIsCloning(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && gitUrl.trim() && !isCloning) {
      handleClone()
    } else if (e.key === 'Escape' && !isCloning) {
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
      onClick={isCloning ? undefined : onClose}
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
          <h2 style={{ margin: 0, fontSize: '18px', color: '#d4d4d4' }}>Clone Repository</h2>
          <button
            onClick={onClose}
            disabled={isCloning}
            style={{
              background: 'none',
              border: 'none',
              cursor: isCloning ? 'not-allowed' : 'pointer',
              color: '#8e8e8e',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              opacity: isCloning ? 0.5 : 1
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Git URL */}
          <div>
            <label
              htmlFor="gitUrl"
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '13px',
                color: '#d4d4d4'
              }}
            >
              Git URL
            </label>
            <input
              id="gitUrl"
              type="text"
              value={gitUrl}
              onChange={(e) => {
                setGitUrl(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              placeholder="https://github.com/user/repo.git"
              autoFocus
              disabled={isCloning}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #3e3e3e',
                borderRadius: '4px',
                color: '#d4d4d4',
                fontSize: '13px',
                outline: 'none',
                opacity: isCloning ? 0.6 : 1
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
                disabled={isCloning}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  backgroundColor: '#1e1e1e',
                  border: '1px solid #3e3e3e',
                  borderRadius: '4px',
                  color: '#d4d4d4',
                  fontSize: '13px',
                  outline: 'none',
                  opacity: isCloning ? 0.6 : 1
                }}
              />
              <button
                onClick={handleBrowse}
                disabled={isCloning}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#3e3e3e',
                  border: '1px solid #505050',
                  borderRadius: '4px',
                  color: '#d4d4d4',
                  cursor: isCloning ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '13px',
                  opacity: isCloning ? 0.6 : 1
                }}
              >
                <FolderOpen size={16} />
                Browse
              </button>
            </div>
          </div>

          {/* Cloning Progress */}
          {isCloning && (
            <div style={{ padding: '12px', backgroundColor: '#264f78', borderRadius: '4px', fontSize: '13px', color: '#d4d4d4', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #d4d4d4',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }}
              />
              Cloning repository...
            </div>
          )}

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
              disabled={isCloning}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                border: '1px solid #3e3e3e',
                borderRadius: '4px',
                color: '#d4d4d4',
                cursor: isCloning ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                opacity: isCloning ? 0.6 : 1
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleClone}
              disabled={!gitUrl.trim() || isCloning}
              style={{
                padding: '8px 16px',
                backgroundColor: gitUrl.trim() && !isCloning ? '#569cd6' : '#3e3e3e',
                border: 'none',
                borderRadius: '4px',
                color: gitUrl.trim() && !isCloning ? '#ffffff' : '#6e6e6e',
                cursor: gitUrl.trim() && !isCloning ? 'pointer' : 'not-allowed',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              Clone
            </button>
          </div>
        </div>
      </div>

      {/* Spinner animation */}
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  )
}
