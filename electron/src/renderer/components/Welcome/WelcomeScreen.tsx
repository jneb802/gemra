import React from 'react'
import { Plus, FolderOpen, GitBranch } from 'lucide-react'
import { ActionCard } from './ActionCard'
import { RecentItem } from './RecentItem'
import { useRecentStore } from '@renderer/stores/recentStore'

interface WelcomeScreenProps {
  onCreateProject: () => void
  onOpenRepository: () => void
  onCloneRepository: () => void
  onOpenRecent: (path: string) => void
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onCreateProject,
  onOpenRepository,
  onCloneRepository,
  onOpenRecent
}) => {
  const recentItems = useRecentStore(state => state.getRecent())

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
        padding: '40px',
        overflow: 'auto'
      }}
    >
      <div style={{ maxWidth: '900px', width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 600, margin: 0, marginBottom: '8px' }}>
            Welcome to Gemra
          </h1>
          <p style={{ fontSize: '14px', color: '#8e8e8e', margin: 0 }}>
            Get started by creating a new project or opening an existing one
          </p>
        </div>

        {/* Action Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '48px'
          }}
        >
          <ActionCard
            icon={<Plus />}
            title="Create Project"
            description="Create a new project directory"
            onClick={onCreateProject}
          />
          <ActionCard
            icon={<FolderOpen />}
            title="Open Repository"
            description="Open an existing directory"
            onClick={onOpenRepository}
          />
          <ActionCard
            icon={<GitBranch />}
            title="Clone Repository"
            description="Clone from a git repository"
            onClick={onCloneRepository}
          />
        </div>

        {/* Recent Items */}
        {recentItems.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#d4d4d4' }}>
                Recent
              </h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {recentItems.map((item) => (
                <RecentItem
                  key={item.id}
                  item={item}
                  onClick={() => onOpenRecent(item.path)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
