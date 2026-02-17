import React from 'react'
import { Plus, FolderOpen, GitBranch } from 'lucide-react'
import { ActionCard } from './ActionCard'
import { RecentItem } from './RecentItem'
import { useRecentStore } from '@renderer/stores/recentStore'
import './WelcomeScreen.css'

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
    <div className="welcome-screen">
      <div className="welcome-screen__container">
        {/* Action Cards */}
        <div className="welcome-screen__actions">
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
          <div className="welcome-screen__recent">
            <div className="welcome-screen__recent-header">
              <h2 className="welcome-screen__recent-title">
                Recent
              </h2>
            </div>
            <div className="welcome-screen__recent-list">
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
