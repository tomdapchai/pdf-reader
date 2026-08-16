import { useCallback, useEffect, useRef, useState } from 'react'
import Toolbar from './components/Toolbar'
import PdfViewer, { type PdfViewerHandle } from './components/PdfViewer'
import TocSidebar from './components/TocSidebar'
import ChatSidebar from './components/ChatSidebar'
import SearchBar from './components/SearchBar'
import SettingsModal from './components/SettingsModal'
import SelectionPopover from './components/SelectionPopover'
import { type PageSelection } from './components/PageView'
import { useChat } from './lib/useChat'
import { loadPdf, getNumPages, getOutline, extractPagesText, clearCaches } from './lib/pdf'
import { getSettings, setSettings, getRecent, addRecent } from './lib/store'
import type { Settings, Highlight, TocItem } from '@shared/types'

const HIGHLIGHT_COLOR = '#ffd54a'
const PAGE_CAP = 4000

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function App() {
  const [settings, setSettingsState] = useState<Settings | null>(null)
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [outline, setOutline] = useState<TocItem[]>([])
  const [zoom, setZoom] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [highlightMode, setHighlightMode] = useState(false)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [selection, setSelection] = useState<PageSelection | null>(null)
  const [tocOpen, setTocOpen] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [dark, setDark] = useState(true)
  const [chatWidth, setChatWidth] = useState(340)

  const viewerRef = useRef<PdfViewerHandle>(null)
  const loadedPathRef = useRef<string | null>(null)
  const selectionRef = useRef<PageSelection | null>(null)
  const currentPageRef = useRef(1)
  const highlightModeRef = useRef(false)
  const highlightsRef = useRef<Highlight[]>([])
  const undoStackRef = useRef<Highlight[][]>([])
  const redoStackRef = useRef<Highlight[][]>([])
  const chatWidthRef = useRef(340)

  const chat = useChat(settings, pdfPath)

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])
  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])
  useEffect(() => {
    highlightModeRef.current = highlightMode
  }, [highlightMode])
  useEffect(() => {
    highlightsRef.current = highlights
  }, [highlights])
  useEffect(() => {
    chatWidthRef.current = chatWidth
  }, [chatWidth])

  useEffect(() => {
    ;(async () => {
      const s = await getSettings()
      setSettingsState(s)
      setDark(s.theme === 'dark')
      setRecentFiles(await getRecent())
    })()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  const updateSettings = useCallback(
    async (next: Settings) => {
      setSettingsState(next)
      setDark(next.theme === 'dark')
      await setSettings(next)
    },
    []
  )

  const toggleTheme = useCallback(() => {
    setDark((d) => {
      const nd = !d
      if (settings) void updateSettings({ ...settings, theme: nd ? 'dark' : 'light' })
      return nd
    })
  }, [settings, updateSettings])

  useEffect(() => {
    if (!pdfPath || loadedPathRef.current !== pdfPath) return
    const t = setTimeout(() => {
      void window.api.saveHighlights(pdfPath, { version: 1, highlights })
    }, 500)
    return () => clearTimeout(t)
  }, [highlights, pdfPath])

  useEffect(() => {
    if (!pdfPath) return
    const t = setTimeout(() => {
      void window.api.saveState({
        pdfPath,
        currentPage,
        zoom,
        activeSessionId: chat.activeSessionId,
        highlightMode,
        chatOpen,
        tocOpen,
        updatedAt: Date.now()
      })
    }, 400)
    return () => clearTimeout(t)
  }, [pdfPath, currentPage, zoom, highlightMode, chatOpen, tocOpen, chat.activeSessionId])

  const load = useCallback(async (path: string) => {
    try {
      const data = await window.api.readFile(path)
      await loadPdf(data)
      const pages = await getNumPages()
      setPdfPath(path)
      setFileName(path.split(/[\\/]/).pop() ?? path)
      setTotalPages(pages)
      setCurrentPage(1)
      setZoom(1)
      setHighlightMode(false)
      setSelection(null)
      setOutline(await getOutline())
      const saved = await window.api.loadHighlights(path)
      setHighlights(saved.highlights ?? [])
      undoStackRef.current = []
      redoStackRef.current = []
      loadedPathRef.current = path
      setRecentFiles(await addRecent(path))

      const state = await window.api.getState(path)
      if (state) {
        setCurrentPage(state.currentPage || 1)
        setZoom(state.zoom || 1)
        setHighlightMode(state.highlightMode)
        setChatOpen(state.chatOpen)
        setTocOpen(state.tocOpen)
        if ((state.currentPage || 1) > 1) {
          viewerRef.current?.scrollToPage(state.currentPage)
        }
      }
    } catch (err) {
      console.error('Failed to load PDF', err)
      window.alert('Failed to open this PDF.')
    }
  }, [])

  const openPdf = useCallback(async () => {
    const path = await window.api.openPdf()
    if (path) await load(path)
  }, [load])

  useEffect(() => {
    clearCaches()
  }, [pdfPath])

  const scrollToPage = useCallback((page: number) => {
    viewerRef.current?.scrollToPage(page)
  }, [])

  const handleZoomChange = useCallback((z: number) => {
    setZoom(Math.min(Math.max(z, 0.3), 4))
  }, [])

  const handleSelection = useCallback(
    (sel: PageSelection | null) => {
      setSelection(sel)
      if (sel && highlightModeRef.current) {
        addHighlight(sel)
      }
    },
    []
  )

  const pushUndo = useCallback(() => {
    undoStackRef.current.push(highlightsRef.current)
    if (undoStackRef.current.length > 50) undoStackRef.current.shift()
    redoStackRef.current = []
  }, [])

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop()
    if (!prev) return
    redoStackRef.current.push(highlightsRef.current)
    setHighlights(prev)
  }, [])

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop()
    if (!next) return
    undoStackRef.current.push(highlightsRef.current)
    setHighlights(next)
  }, [])

  const addHighlight = useCallback(
    (sel: PageSelection) => {
      const exists = highlightsRef.current.some((h) => h.page === sel.page && h.text === sel.text)
      if (exists) return
      pushUndo()
      const h: Highlight = {
        id: makeId(),
        page: sel.page,
        text: sel.text,
        rects: sel.rects,
        color: HIGHLIGHT_COLOR,
        createdAt: Date.now()
      }
      setHighlights((prev) => [...prev, h])
    },
    [pushUndo]
  )

  const removeHighlight = useCallback(
    (id: string) => {
      pushUndo()
      setHighlights((prev) => prev.filter((h) => h.id !== id))
    },
    [pushUndo]
  )

  const addSelectionToChat = useCallback(() => {
    const sel = selectionRef.current
    if (!sel) return
    chat.addContext({
      id: makeId(),
      kind: 'selection',
      label: `Page ${sel.page} · selection`,
      page: sel.page,
      text: sel.text
    })
    setSelection(null)
    setChatOpen(true)
    window.getSelection()?.removeAllRanges()
  }, [chat.addContext])

  const addPagesToChat = useCallback(
    async (pages: number[], label: string) => {
      if (pages.length === 0) return
      const text = await extractPagesText(pages, PAGE_CAP)
      chat.addContext({
        id: makeId(),
        kind: 'page',
        label,
        page: pages[0],
        text
      })
      setChatOpen(true)
    },
    [chat.addContext]
  )

  const addCurrentPageToChat = useCallback(() => {
    void addPagesToChat([currentPageRef.current], `Page ${currentPageRef.current}`)
  }, [addPagesToChat])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      const target = e.target as HTMLElement | null
      const editable =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      if (!e.shiftKey && k === 'z') {
        if (editable) return
        e.preventDefault()
        undo()
        return
      }
      if (k === 'y' || (e.shiftKey && k === 'z')) {
        if (editable) return
        e.preventDefault()
        redo()
        return
      }
      if (!e.shiftKey && k === 'o') {
        e.preventDefault()
        void openPdf()
        return
      }
      if (!e.shiftKey && k === 'k') {
        e.preventDefault()
        setChatOpen((v) => !v)
        return
      }
      if (e.shiftKey && k === 'h') {
        e.preventDefault()
        setHighlightMode((v) => !v)
      } else if (e.shiftKey && k === 'a') {
        e.preventDefault()
        addSelectionToChat()
      } else if (e.shiftKey && k === 'p') {
        e.preventDefault()
        addCurrentPageToChat()
      } else if (e.shiftKey && k === 'c') {
        e.preventDefault()
        setChatOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [addSelectionToChat, addCurrentPageToChat, undo, redo, openPdf])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files?.[0]
      if (!file) return
      const path = window.api.getPathForFile(file)
      if (path.toLowerCase().endsWith('.pdf')) void load(path)
    },
    [load]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const startChatResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = chatWidthRef.current
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(Math.max(startWidth + (startX - ev.clientX), 280), 720)
      chatWidthRef.current = w
      setChatWidth(w)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const highlightModeForPopover = !highlightMode

  return (
    <div className="app" onDragOver={onDragOver} onDrop={onDrop}>
      <Toolbar
        fileName={fileName}
        page={currentPage}
        totalPages={totalPages}
        zoom={zoom}
        highlightMode={highlightMode}
        chatOpen={chatOpen}
        tocOpen={tocOpen}
        searchOpen={searchOpen}
        dark={dark}
        recentFiles={recentFiles}
        onOpen={openPdf}
        onPageChange={scrollToPage}
        onZoomChange={handleZoomChange}
        onToggleHighlight={() => setHighlightMode((v) => !v)}
        onToggleChat={() => setChatOpen((v) => !v)}
        onToggleToc={() => setTocOpen((v) => !v)}
        onToggleSearch={() => setSearchOpen((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleTheme={toggleTheme}
        onOpenRecent={load}
      />

      <div className="main">
        {tocOpen && pdfPath && (
          <TocSidebar
            outline={outline}
            highlights={highlights}
            activePage={currentPage}
            onJump={scrollToPage}
            onDeleteHighlight={removeHighlight}
            onClose={() => setTocOpen(false)}
          />
        )}

        <div className="viewer-wrap">
          {searchOpen && pdfPath && (
            <SearchBar
              totalPages={totalPages}
              onJump={scrollToPage}
              onClose={() => setSearchOpen(false)}
            />
          )}
          <PdfViewer
            ref={viewerRef}
            totalPages={totalPages}
            zoom={zoom}
            onZoomChange={handleZoomChange}
            currentPage={currentPage}
            onCurrentPageChange={setCurrentPage}
            highlights={highlights}
            highlightMode={highlightMode}
            selectionColor="#3b82f6"
            activeSelection={selection}
            onSelection={handleSelection}
          />
        </div>

        {chatOpen && settings && (
          <>
            <div className="chat-resizer" onMouseDown={startChatResize} />
            <ChatSidebar
              width={chatWidth}
              messages={chat.messages}
              context={chat.context}
              streaming={chat.streaming}
              error={chat.error}
              currentPage={currentPage}
              hasApiKey={!!settings.apiKey}
              sessions={chat.sessions}
              activeSessionId={chat.activeSessionId}
              onSend={chat.send}
              onAddContext={chat.addContext}
              onRemoveContext={chat.removeContext}
              onClearContext={chat.clearContext}
              onClearChat={chat.clearChat}
              onNewSession={chat.newSession}
              onSelectSession={chat.selectSession}
              onRenameSession={chat.renameSession}
              onDeleteSession={chat.deleteSession}
              onOpenSettings={() => setSettingsOpen(true)}
              onClose={() => setChatOpen(false)}
            />
          </>
        )}
      </div>

      {selection && (
        <SelectionPopover
          selection={selection}
          showHighlight={highlightModeForPopover}
          onAddToChat={addSelectionToChat}
          onHighlight={addHighlight}
          onCopy={(text) => void navigator.clipboard.writeText(text)}
          onDismiss={() => {
            setSelection(null)
            window.getSelection()?.removeAllRanges()
          }}
        />
      )}

      {settingsOpen && settings && (
        <SettingsModal
          settings={settings}
          onSave={(s) => void updateSettings(s)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
