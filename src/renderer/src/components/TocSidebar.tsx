import { useState } from 'react'
import type { TocNode } from '../lib/pdf'
import type { Highlight } from '@shared/types'
import { IconTrash, IconClose } from './icons'

interface TocSidebarProps {
  outline: TocNode[]
  highlights: Highlight[]
  activePage: number
  onJump: (page: number) => void
  onDeleteHighlight: (id: string) => void
  onClose: () => void
}

function TocTree({
  nodes,
  activePage,
  onJump
}: {
  nodes: TocNode[]
  activePage: number
  onJump: (page: number) => void
}) {
  return (
    <ul className="toc-list">
      {nodes.map((n, i) => (
        <TocNodeView key={`${n.title}-${i}`} node={n} activePage={activePage} onJump={onJump} />
      ))}
    </ul>
  )
}

function TocNodeView({
  node,
  activePage,
  onJump
}: {
  node: TocNode
  activePage: number
  onJump: (page: number) => void
}) {
  const [open, setOpen] = useState(true)
  const hasChildren = node.children.length > 0
  const active = activePage === node.pageNumber
  return (
    <li>
      <div className={`toc-row${active ? ' active' : ''}`}>
        {hasChildren ? (
          <button className="toc-toggle" onClick={() => setOpen((v) => !v)}>
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="toc-toggle" />
        )}
        <button
          className="toc-label"
          disabled={node.pageNumber <= 0}
          onClick={() => node.pageNumber > 0 && onJump(node.pageNumber)}
        >
          {node.title}
        </button>
        {node.pageNumber > 0 && <span className="toc-page">{node.pageNumber}</span>}
      </div>
      {hasChildren && open && (
        <TocTree nodes={node.children} activePage={activePage} onJump={onJump} />
      )}
    </li>
  )
}

export default function TocSidebar({
  outline,
  highlights,
  activePage,
  onJump,
  onDeleteHighlight,
  onClose
}: TocSidebarProps) {
  return (
    <div className="sidebar toc-sidebar">
      <div className="sidebar-header">
        <span>Contents</span>
        <button className="tool-btn icon" title="Close" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <div className="sidebar-scroll">
        {outline.length === 0 ? (
          <p className="sidebar-empty">No table of contents in this PDF.</p>
        ) : (
          <TocTree nodes={outline} activePage={activePage} onJump={onJump} />
        )}

        <div className="sidebar-header sub">
          <span>Highlights ({highlights.length})</span>
        </div>
        {highlights.length === 0 ? (
          <p className="sidebar-empty">No highlights yet. Select text to highlight it.</p>
        ) : (
          <ul className="highlights-list">
            {[...highlights].reverse().map((h) => (
              <li key={h.id} className="highlight-item">
                <button className="highlight-jump" onClick={() => onJump(h.page)}>
                  <span className="highlight-text">{h.text.slice(0, 140)}</span>
                  <span className="highlight-meta">
                    p. {h.page}
                    <span className="dot" style={{ backgroundColor: h.color }} />
                  </span>
                </button>
                <button
                  className="tool-btn icon small"
                  title="Delete highlight"
                  onClick={() => onDeleteHighlight(h.id)}
                >
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
