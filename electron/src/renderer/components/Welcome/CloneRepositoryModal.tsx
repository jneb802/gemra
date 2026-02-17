import React, { useState } from 'react'
import * as path from 'path'
import {
  ModalContainer,
  FormInput,
  LocationPicker,
  ErrorMessage,
  ModalActions,
} from '../common'
import { useDefaultLocation } from '../../hooks/useDefaultLocation'
import { useModalKeyboard } from '../../hooks/useModalKeyboard'

interface CloneRepositoryModalProps {
  onClose: () => void
  onClone: (url: string, targetPath: string) => void
}

const validateGitUrl = (url: string): boolean => {
  // Basic git URL validation
  const patterns = [
    /^https?:\/\/.+\.git$/,
    /^git@.+:.+\.git$/,
    /^https?:\/\/github\.com\/.+\/.+$/,
    /^https?:\/\/gitlab\.com\/.+\/.+$/,
    /^https?:\/\/bitbucket\.org\/.+\/.+$/,
  ]
  return patterns.some((pattern) => pattern.test(url))
}

export const CloneRepositoryModal: React.FC<CloneRepositoryModalProps> = ({
  onClose,
  onClone,
}) => {
  const [gitUrl, setGitUrl] = useState('')
  const [location, setLocation] = useDefaultLocation()
  const [isCloning, setIsCloning] = useState(false)
  const [error, setError] = useState('')

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
    const result = await window.electron.dialog.checkDirectory(targetPath)
    if (result.success && result.exists) {
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

  const handleKeyDown = useModalKeyboard({
    onEnter: handleClone,
    onEscape: isCloning ? undefined : onClose,
    canSubmit: gitUrl.trim().length > 0 && !isCloning,
  })

  return (
    <ModalContainer title="Clone Repository" onClose={isCloning ? () => {} : onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <FormInput
          id="gitUrl"
          label="Git URL"
          value={gitUrl}
          onChange={(value) => {
            setGitUrl(value)
            setError('')
          }}
          onKeyDown={handleKeyDown}
          placeholder="https://github.com/user/repo.git"
          autoFocus
          disabled={isCloning}
        />

        <LocationPicker value={location} onChange={setLocation} disabled={isCloning} />

        {/* Cloning Progress */}
        {isCloning && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#264f78',
              borderRadius: '4px',
              fontSize: '13px',
              color: '#d4d4d4',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: '16px',
                height: '16px',
                border: '2px solid #d4d4d4',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            Cloning repository...
          </div>
        )}

        <ErrorMessage message={error} />

        <ModalActions
          onCancel={onClose}
          onSubmit={handleClone}
          submitLabel="Clone"
          canSubmit={gitUrl.trim().length > 0}
          isLoading={isCloning}
        />
      </div>

      {/* Spinner animation */}
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </ModalContainer>
  )
}
