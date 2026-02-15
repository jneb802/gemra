import React, { useState, useRef, useEffect } from 'react'
import { ContextIndicator } from './ContextIndicator'

interface StatusBarProps {
  mode: 'default' | 'acceptEdits' | 'plan'
  model: string
  gitBranch: string
  gitStats: {
    filesChanged: number
    insertions: number
    deletions: number
  }
  tokenUsage: {
    inputTokens: number
    outputTokens: number
  }
  onModeChange: (mode: 'default' | 'acceptEdits' | 'plan') => void
  onModelChange: (model: string) => void
}

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  model,
  gitBranch,
  gitStats,
  tokenUsage,
  onModeChange,
  onModelChange,
}) => {
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const modeMenuRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const getModeLabel = () => {
    switch (mode) {
      case 'acceptEdits':
        return 'Accept Edits'
      case 'plan':
        return 'Plan'
      default:
        return 'Default'
    }
  }

  const getModelLabel = () => {
    switch (model) {
      case 'default':
        return 'Opus 4.6'
      case 'sonnet':
        return 'Sonnet 4.5'
      case 'haiku':
        return 'Haiku 4.5'
      default:
        return model
    }
  }

  const models = [
    { id: 'default', label: 'Opus 4.6', description: 'Most capable' },
    { id: 'sonnet', label: 'Sonnet 4.5', description: 'Best for everyday tasks' },
    { id: 'haiku', label: 'Haiku 4.5', description: 'Fastest' },
  ]

  const modes = [
    { id: 'default' as const, label: 'Default', description: 'Standard behavior' },
    { id: 'acceptEdits' as const, label: 'Accept Edits', description: 'Auto-accept edits' },
    { id: 'plan' as const, label: 'Plan', description: 'Planning only' },
  ]

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target as Node)) {
        setShowModeMenu(false)
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setShowModelMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        height: '32px',
        padding: '0 16px',
        backgroundColor: '#252525',
        borderTop: '1px solid #3e3e3e',
        fontSize: '12px',
        color: '#888',
      }}
    >
      {/* Context indicator */}
      <ContextIndicator
        inputTokens={tokenUsage.inputTokens}
        outputTokens={tokenUsage.outputTokens}
        model={model}
      />

      {/* Separator */}
      <div style={{ width: '1px', height: '16px', backgroundColor: '#3e3e3e' }} />

      {/* Model selector */}
      <div ref={modelMenuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#666' }}>Model:</span>
        <button
          onClick={() => setShowModelMenu(!showModelMenu)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#b0b0b0',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#3e3e3e'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          {getModelLabel()} ▾
        </button>

        {showModelMenu && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '0',
              marginBottom: '8px',
              backgroundColor: '#2d2d2d',
              border: '1px solid #3e3e3e',
              borderRadius: '4px',
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
              minWidth: '200px',
              zIndex: 1000,
            }}
          >
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onModelChange(m.id)
                  setShowModelMenu(false)
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: model === m.id ? '#3e3e3e' : 'transparent',
                  color: '#d4d4d4',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '12px',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#3e3e3e'
                }}
                onMouseLeave={(e) => {
                  if (model !== m.id) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                <div style={{ fontWeight: 500 }}>{m.label}</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{m.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Separator */}
      <div style={{ width: '1px', height: '16px', backgroundColor: '#3e3e3e' }} />

      {/* Mode selector */}
      <div ref={modeMenuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#666' }}>Mode:</span>
        <button
          onClick={() => setShowModeMenu(!showModeMenu)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#b0b0b0',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#3e3e3e'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          {getModeLabel()} ▾
        </button>

        {showModeMenu && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '0',
              marginBottom: '8px',
              backgroundColor: '#2d2d2d',
              border: '1px solid #3e3e3e',
              borderRadius: '4px',
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
              minWidth: '180px',
              zIndex: 1000,
            }}
          >
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onModeChange(m.id)
                  setShowModeMenu(false)
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: mode === m.id ? '#3e3e3e' : 'transparent',
                  color: '#d4d4d4',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '12px',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#3e3e3e'
                }}
                onMouseLeave={(e) => {
                  if (mode !== m.id) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                <div style={{ fontWeight: 500 }}>{m.label}</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{m.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Separator */}
      <div style={{ width: '1px', height: '16px', backgroundColor: '#3e3e3e' }} />

      {/* Git branch */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#666' }}>Branch:</span>
        <span
          style={{
            color: '#b0b0b0',
            fontFamily: 'Monaco, Menlo, Consolas, monospace',
          }}
        >
          {gitBranch}
        </span>
      </div>

      {/* Git stats - only show if there are changes */}
      {(gitStats.filesChanged > 0 || gitStats.insertions > 0 || gitStats.deletions > 0) && (
        <>
          {/* Separator */}
          <div style={{ width: '1px', height: '16px', backgroundColor: '#3e3e3e' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {gitStats.filesChanged > 0 && (
              <span style={{ color: '#b0b0b0' }}>
                {gitStats.filesChanged} file{gitStats.filesChanged !== 1 ? 's' : ''}
              </span>
            )}
            {gitStats.insertions > 0 && (
              <span style={{ color: '#4ade80' }}>+{gitStats.insertions}</span>
            )}
            {gitStats.deletions > 0 && (
              <span style={{ color: '#f87171' }}>-{gitStats.deletions}</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
