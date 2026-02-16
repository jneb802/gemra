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
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
        padding: '40px',
        overflow: 'auto'
      }}
    >
      <div style={{ maxWidth: '700px', width: '100%' }}>
        {/* Action Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            marginBottom: '32px'
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
