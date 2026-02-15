import React from 'react'

interface StatusBarProps {
  mode: 'default' | 'acceptEdits' | 'plan'
  gitBranch: string
  gitStats: {
    filesChanged: number
    insertions: number
    deletions: number
  }
}

export const StatusBar: React.FC<StatusBarProps> = ({ mode, gitBranch, gitStats }) => {
  const getModeLabel = () => {
    switch (mode) {
      case 'acceptEdits':
        return 'Accept Edits'
      case 'plan':
        return 'Plan Mode'
      default:
        return 'Default'
    }
  }

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
      {/* Mode indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#666' }}>Mode:</span>
        <span style={{ color: '#b0b0b0' }}>{getModeLabel()}</span>
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
