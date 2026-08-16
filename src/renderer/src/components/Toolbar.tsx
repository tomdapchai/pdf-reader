import { useRef, useState, useEffect } from 'react'
import {
  IconFolderOpen,
  IconChat,
  IconHighlight,
  IconSearch,
  IconSettings,
  IconSun,
  IconMoon,
  IconChevronLeft,
  IconChevronRight,
  IconZoomIn,
  IconZoomOut,
  IconList
} from './icons'

interface ToolbarProps {
  fileName: string | null
  page: number
  totalPages: number
  zoom: number
  highlightMode: boolean
  chatOpen: boolean
  tocOpen: boolean
  searchOpen: boolean
  dark: boolean
  recentFiles: string[]
  onOpen: () => void
  onPageChange: (page: number) => void
  onZoomChange: (zoom: number) => void
  onToggleHighlight: () => void
  onToggleChat: () => void
  onToggleToc: () => void
  onToggleSearch: () => void
  onOpenSettings: () => void
  onToggleTheme: () => void
  onOpenRecent: (path: string) => void
}

export default function Toolbar({
  fileName,
  page,
  totalPages,
  zoom,
  highlightMode,
  chatOpen,
  searchOpen,
  dark,
  recentFiles,
  onOpen,
  onPageChange,
  onZoomChange,
  onToggleHighlight,
  onToggleChat,
  onToggleToc,
  onToggleSearch,
  onOpenSettings,
  onToggleTheme,
  onOpenRecent
}: ToolbarProps) {
  const [pageInput, setPageInput] = useState(String(page))
  const [recentOpen, setRecentOpen] = useState(false)
  const recentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPageInput(String(page))
  }, [page])

  useEffect(() => {
    if (!recentOpen) return
    const onClick = (e: MouseEvent) => {
      if (!recentRef.current?.contains(e.target as Node)) setRecentOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [recentOpen])

  const commitPage = () => {
    const n = parseInt(pageInput, 10)
    if (!Number.isNaN(n)) onPageChange(n)
    else setPageInput(String(page))
  }

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="tool-btn" title="Open PDF" onClick={onOpen}>
          <IconFolderOpen />
          <span>Open</span>
        </button>

        <div className="recent-wrap" ref={recentRef}>
          <button
            className="tool-btn"
            title="Recent files"
            disabled={recentFiles.length === 0}
            onClick={() => setRecentOpen((v) => !v)}
          >
            Recent
          </button>
          {recentOpen && recentFiles.length > 0 && (
            <div className="recent-menu">
              {recentFiles.map((p) => (
                <button
                  key={p}
                  className="recent-item"
                  title={p}
                  onClick={() => {
                    setRecentOpen(false)
                    onOpenRecent(p)
                  }}
                >
                  {p.split(/[\\/]/).pop()}
                  <span className="recent-path">{p}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {fileName && <span className="file-name" title={fileName}>{fileName}</span>}
      </div>

      <div className="toolbar-group center">
        <button className="tool-btn icon" title="Table of contents" onClick={onToggleToc}>
          <IconList />
        </button>
        <button
          className="tool-btn icon"
          title="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <IconChevronLeft />
        </button>
        <div className="page-nav">
          <input
            className="page-input"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitPage()
            }}
            onBlur={commitPage}
          />
          <span className="page-total">/ {totalPages || 0}</span>
        </div>
        <button
          className="tool-btn icon"
          title="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <IconChevronRight />
        </button>
        <button className="tool-btn icon" title="Zoom out" onClick={() => onZoomChange(zoom - 0.1)}>
          <IconZoomOut />
        </button>
        <button
          className="zoom-value"
          title="Reset zoom"
          onClick={() => onZoomChange(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button className="tool-btn icon" title="Zoom in" onClick={() => onZoomChange(zoom + 0.1)}>
          <IconZoomIn />
        </button>
      </div>

      <div className="toolbar-group right">
        <button
          className={`tool-btn icon${highlightMode ? ' active' : ''}`}
          title="Highlight mode"
          onClick={onToggleHighlight}
        >
          <IconHighlight />
        </button>
        <button
          className={`tool-btn icon${searchOpen ? ' active' : ''}`}
          title="Search"
          onClick={onToggleSearch}
        >
          <IconSearch />
        </button>
        <button
          className={`tool-btn icon${chatOpen ? ' active' : ''}`}
          title="AI chat"
          onClick={onToggleChat}
        >
          <IconChat />
        </button>
        <button className="tool-btn icon" title="Settings" onClick={onOpenSettings}>
          <IconSettings />
        </button>
        <button className="tool-btn icon" title="Toggle theme" onClick={onToggleTheme}>
          {dark ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </div>
  )
}
