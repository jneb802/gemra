import React, { useState, useEffect, useRef } from 'react'
import type { TerminalBlock } from '../../../shared/types/blocks'

interface BlockNavigationProps {
  blocks: TerminalBlock[]
  currentBlockId?: string
  onNavigate: (blockId: string) => void
  onFilter?: (filter: 'all' | 'failed' | 'success') => void
}

/**
 * BlockNavigation - Search and navigate through terminal blocks
 */
export function BlockNavigation({
  blocks,
  currentBlockId,
  onNavigate,
  onFilter,
}: BlockNavigationProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'failed' | 'success'>('all')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Filter blocks by search query and filter
  const filteredBlocks = blocks.filter(block => {
    // Apply status filter
    if (selectedFilter === 'failed' && block.exitCode !== undefined && block.exitCode !== 0) {
      // Show only failed commands
    } else if (selectedFilter === 'success' && block.exitCode === 0) {
      // Show only successful commands
    } else if (selectedFilter !== 'all') {
      return false
    }

    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesCommand = block.command?.toLowerCase().includes(query)
      const matchesOutput = block.content.toLowerCase().includes(query)
      return matchesCommand || matchesOutput
    }

    return true
  })

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+F - Open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setIsSearchOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 0)
      }

      // Escape - Close search
      if (e.key === 'Escape' && isSearchOpen) {
        e.preventDefault()
        setIsSearchOpen(false)
        setSearchQuery('')
      }

      // Cmd/Ctrl+G - Next result
      if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey) {
        e.preventDefault()
        navigateToNext()
      }

      // Cmd/Ctrl+Shift+G - Previous result
      if ((e.metaKey || e.ctrlKey) && e.key === 'G' && e.shiftKey) {
        e.preventDefault()
        navigateToPrevious()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSearchOpen, filteredBlocks, currentBlockId])

  const navigateToNext = () => {
    if (filteredBlocks.length === 0) return

    const currentIndex = filteredBlocks.findIndex(b => b.id === currentBlockId)
    const nextIndex = (currentIndex + 1) % filteredBlocks.length
    onNavigate(filteredBlocks[nextIndex].id)
  }

  const navigateToPrevious = () => {
    if (filteredBlocks.length === 0) return

    const currentIndex = filteredBlocks.findIndex(b => b.id === currentBlockId)
    const prevIndex = currentIndex <= 0 ? filteredBlocks.length - 1 : currentIndex - 1
    onNavigate(filteredBlocks[prevIndex].id)
  }

  const handleFilterChange = (filter: 'all' | 'failed' | 'success') => {
    setSelectedFilter(filter)
    onFilter?.(filter)
  }

  if (!isSearchOpen) {
    return (
      <div className="block-navigation-toggle">
        <button
          className="nav-toggle-button"
          onClick={() => setIsSearchOpen(true)}
          title="Search blocks (Cmd+F)"
        >
          🔍
        </button>
      </div>
    )
  }

  return (
    <div className="block-navigation">
      <div className="nav-search">
        <input
          ref={searchInputRef}
          type="text"
          className="nav-search-input"
          placeholder="Search commands and output..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="nav-search-results">
          {searchQuery && (
            <span>
              {filteredBlocks.length} result{filteredBlocks.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="nav-filters">
        <button
          className={`nav-filter-button ${selectedFilter === 'all' ? 'active' : ''}`}
          onClick={() => handleFilterChange('all')}
        >
          All
        </button>
        <button
          className={`nav-filter-button ${selectedFilter === 'failed' ? 'active' : ''}`}
          onClick={() => handleFilterChange('failed')}
        >
          Failed
        </button>
        <button
          className={`nav-filter-button ${selectedFilter === 'success' ? 'active' : ''}`}
          onClick={() => handleFilterChange('success')}
        >
          Success
        </button>
      </div>

      <div className="nav-actions">
        <button
          className="nav-action-button"
          onClick={navigateToPrevious}
          disabled={filteredBlocks.length === 0}
          title="Previous (Cmd+Shift+G)"
        >
          ↑
        </button>
        <button
          className="nav-action-button"
          onClick={navigateToNext}
          disabled={filteredBlocks.length === 0}
          title="Next (Cmd+G)"
        >
          ↓
        </button>
        <button
          className="nav-action-button"
          onClick={() => {
            setIsSearchOpen(false)
            setSearchQuery('')
          }}
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
