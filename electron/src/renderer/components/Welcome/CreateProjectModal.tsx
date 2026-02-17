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

interface CreateProjectModalProps {
  onClose: () => void
  onCreate: (name: string, location: string, initGit: boolean) => void
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  onClose,
  onCreate,
}) => {
  const [projectName, setProjectName] = useState('')
  const [location, setLocation] = useDefaultLocation()
  const [initGit, setInitGit] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!projectName.trim()) {
      setError('Project name is required')
      return
    }

    const targetPath = path.join(location, projectName.trim())

    // Check if directory already exists
    const result = await window.electron.dialog.checkDirectory(targetPath)
    if (result.success && result.exists) {
      setError('A directory with this name already exists')
      return
    }

    onCreate(projectName.trim(), location, initGit)
    onClose()
  }

  const handleKeyDown = useModalKeyboard({
    onEnter: handleCreate,
    onEscape: onClose,
    canSubmit: projectName.trim().length > 0,
  })

  return (
    <ModalContainer title="Create Project" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <FormInput
          id="projectName"
          label="Project Name"
          value={projectName}
          onChange={(value) => {
            setProjectName(value)
            setError('')
          }}
          onKeyDown={handleKeyDown}
          placeholder="my-project"
          autoFocus
        />

        <LocationPicker value={location} onChange={setLocation} />

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
              cursor: 'pointer',
            }}
          >
            Initialize git repository
          </label>
        </div>

        <ErrorMessage message={error} />

        <ModalActions
          onCancel={onClose}
          onSubmit={handleCreate}
          submitLabel="Create"
          canSubmit={projectName.trim().length > 0}
        />
      </div>
    </ModalContainer>
  )
}
