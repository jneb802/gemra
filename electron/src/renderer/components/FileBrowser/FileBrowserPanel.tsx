import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, Folder, File, Home } from 'lucide-react'
import { useFileBrowserStore } from '../../stores/fileBrowserStore'
import type { FileInfo } from '../../../preload'

interface FileTreeItemProps {
  file: FileInfo
  level: number
}

function FileTreeItem({ file, level }: FileTreeItemProps) {
  const [children, setChildren] = useState<FileInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const toggleDirectory = useFileBrowserStore((state) => state.toggleDirectory)
  const isExpanded = useFileBrowserStore((state) => state.isDirectoryExpanded(file.path))

  const handleClick = async () => {
    if (file.isDirectory) {
      toggleDirectory(file.path)

      // Load directory contents if expanding
      if (!isExpanded && children.length === 0) {
        setIsLoading(true)
        const result = await window.electron.fileBrowser.readDir(file.path)
        if (result.success) {
          // Filter out hidden files by default
          setChildren(result.files.filter((f) => !f.isHidden))
        }
        setIsLoading(false)
      }
    } else {
      // Open file in default application
      await window.electron.fileBrowser.open(file.path)
    }
  }

  return (
    <>
      <div
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          paddingLeft: `${level * 16 + 8}px`,
          cursor: 'pointer',
          fontSize: '13px',
          color: '#d4d4d4',
          userSelect: 'none',
          transition: 'background-color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#2d2d2d'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        {file.isDirectory && (
          <span style={{ width: '16px', display: 'flex', alignItems: 'center' }}>
            {isExpanded ? (
              <ChevronDown size={16} color="#b0b0b0" />
            ) : (
              <ChevronRight size={16} color="#b0b0b0" />
            )}
          </span>
        )}
        {!file.isDirectory && <span style={{ width: '16px' }} />}

        {file.isDirectory ? (
          <Folder size={16} color="#8ab4f8" />
        ) : (
          <File size={16} color="#9aa0a6" />
        )}

        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {file.name}
        </span>

        {isLoading && <span style={{ fontSize: '11px', color: '#808080' }}>...</span>}
      </div>

      {file.isDirectory && isExpanded && children.map((child) => (
        <FileTreeItem key={child.path} file={child} level={level + 1} />
      ))}
    </>
  )
}

export function FileBrowserPanel() {
  const [rootFiles, setRootFiles] = useState<FileInfo[]>([])
  const [rootPath, setRootPath] = useState<string>('')
  const isVisible = useFileBrowserStore((state) => state.isVisible)
  const sidebarWidth = useFileBrowserStore((state) => state.sidebarWidth)

  useEffect(() => {
    const loadRootDirectory = async () => {
      // Load home directory by default
      const result = await window.electron.fileBrowser.readDir('')
      if (result.success) {
        setRootPath(result.path)
        // Filter out hidden files
        setRootFiles(result.files.filter((f) => !f.isHidden))
      }
    }

    if (isVisible) {
      loadRootDirectory()
    }
  }, [isVisible])

  if (!isVisible) {
    return null
  }

  return (
    <div
      style={{
        width: `${sidebarWidth}px`,
        height: '100%',
        backgroundColor: '#1e1e1e',
        borderRight: '1px solid #3e3e3e',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderBottom: '1px solid #3e3e3e',
          fontSize: '13px',
          fontWeight: 500,
          color: '#d4d4d4',
        }}
      >
        <Home size={16} color="#b0b0b0" />
        <span>Files</span>
      </div>

      {/* File tree */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {rootFiles.map((file) => (
          <FileTreeItem key={file.path} file={file} level={0} />
        ))}
      </div>

      {/* Footer with current path */}
      {rootPath && (
        <div
          style={{
            padding: '6px 12px',
            borderTop: '1px solid #3e3e3e',
            fontSize: '11px',
            color: '#808080',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={rootPath}
        >
          {rootPath}
        </div>
      )}
    </div>
  )
}
