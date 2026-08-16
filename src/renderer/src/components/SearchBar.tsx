import { useEffect, useRef, useState } from 'react'
import { getPageTextCached } from '../lib/pdf'
import { IconClose, IconChevronLeft, IconChevronRight } from './icons'

interface SearchResult {
  page: number
  snippet: string
  match: string
}

interface SearchBarProps {
  totalPages: number
  onJump: (page: number) => void
  onClose: () => void
}

function highlight(text: string, query: string): { before: string; match: string; after: string } {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return { before: text, match: '', after: '' }
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + query.length),
    after: text.slice(idx + query.length)
  }
}

export default function SearchBar({ totalPages, onJump, onClose }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const seqRef = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (!q || totalPages === 0) {
      setResults([])
      setSearching(false)
      setActiveIndex(-1)
      return
    }
    const seq = ++seqRef.current
    setSearching(true)
    setResults([])
    setActiveIndex(-1)
    const acc: SearchResult[] = []
    ;(async () => {
      for (let p = 1; p <= totalPages; p++) {
        if (seq !== seqRef.current) return
        try {
          const text = await getPageTextCached(p)
          const lower = text.toLowerCase()
          let idx = lower.indexOf(q.toLowerCase())
          if (idx >= 0) {
            let count = 0
            while (idx >= 0 && count < 4) {
              const start = Math.max(0, idx - 30)
              const end = Math.min(text.length, idx + q.length + 30)
              acc.push({
                page: p,
                snippet: text.slice(start, end).replace(/\s+/g, ' ').trim(),
                match: text.slice(idx, idx + q.length)
              })
              idx = lower.indexOf(q.toLowerCase(), idx + q.length)
              count++
            }
            if (seq === seqRef.current) setResults([...acc])
            if (acc.length >= 200) break
          }
        } catch {
          /* ignore */
        }
      }
      if (seq === seqRef.current) setSearching(false)
    })()
  }, [query, totalPages])

  const jumpTo = (i: number) => {
    if (results.length === 0) return
    const idx = (i + results.length) % results.length
    setActiveIndex(idx)
    onJump(results[idx].page)
  }

  return (
    <div className="search-bar">
      <div className="search-input-row">
        <input
          autoFocus
          className="search-input"
          placeholder="Search in document…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') jumpTo(activeIndex + 1)
            if (e.key === 'Escape') onClose()
          }}
        />
        <button className="tool-btn icon" onClick={() => jumpTo(activeIndex - 1)}>
          <IconChevronLeft />
        </button>
        <button className="tool-btn icon" onClick={() => jumpTo(activeIndex + 1)}>
          <IconChevronRight />
        </button>
        <button className="tool-btn icon" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <div className="search-results">
        {searching && <p className="muted">Searching…</p>}
        {!searching && query && results.length === 0 && <p className="muted">No matches.</p>}
        {!searching &&
          results.length > 0 && (
            <p className="muted">
              {results.length} result{results.length === 1 ? '' : 's'} · page{' '}
              {results[activeIndex >= 0 ? activeIndex : 0]?.page}
            </p>
          )}
        <ul>
          {results.slice(0, 50).map((r, i) => {
            const h = highlight(r.snippet, query)
            return (
              <li key={`${r.page}-${i}`}>
                <button
                  className={`search-result${i === activeIndex ? ' active' : ''}`}
                  onClick={() => {
                    setActiveIndex(i)
                    onJump(r.page)
                  }}
                >
                  <span className="search-page">p.{r.page}</span>
                  <span className="search-snippet">
                    {h.before}
                    <mark>{h.match}</mark>
                    {h.after}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
