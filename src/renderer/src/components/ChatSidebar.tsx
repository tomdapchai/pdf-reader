import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatContextItem, Session } from '@shared/types'
import { extractPagesText } from '../lib/pdf'
import type { ChatTurn } from '../lib/useChat'
import {
  IconClose,
  IconSend,
  IconPlus,
  IconTrash,
  IconSettings,
  IconPencil
} from './icons'

interface ChatSidebarProps {
  width: number
  messages: ChatTurn[]
  context: ChatContextItem[]
  streaming: boolean
  error: string | null
  currentPage: number
  hasApiKey: boolean
  sessions: Session[]
  activeSessionId: string | null
  onSend: (text: string) => void
  onAddContext: (item: ChatContextItem) => void
  onRemoveContext: (id: string) => void
  onClearContext: () => void
  onClearChat: () => void
  onNewSession: () => void
  onSelectSession: (id: string) => void
  onRenameSession: (id: string, title: string) => void
  onDeleteSession: (id: string) => void
  onOpenSettings: () => void
  onClose: () => void
}

const PAGE_CAP = 4000

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function ChatSidebar({
  width,
  messages,
  context,
  streaming,
  error,
  currentPage,
  hasApiKey,
  sessions,
  activeSessionId,
  onSend,
  onAddContext,
  onRemoveContext,
  onClearContext,
  onClearChat,
  onNewSession,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onOpenSettings,
  onClose
}: ChatSidebarProps) {
  const [input, setInput] = useState('')
  const [fromPage, setFromPage] = useState('')
  const [toPage, setToPage] = useState('')
  const [pagesList, setPagesList] = useState('')
  const [loadingPage, setLoadingPage] = useState(false)
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const addPages = async (pages: number[], label: string) => {
    if (pages.length === 0 || loadingPage) return
    setLoadingPage(true)
    try {
      const text = await extractPagesText(pages, PAGE_CAP)
      const page = pages[0] ?? currentPage
      onAddContext({
        id: makeId(),
        kind: 'page',
        label,
        page,
        text
      })
    } catch {
      /* ignore */
    } finally {
      setLoadingPage(false)
    }
  }

  const addCurrent = () => {
    if (!currentPage) return
    void addPages([currentPage], `Page ${currentPage}`)
  }

  const addRange = () => {
    const from = parseInt(fromPage, 10)
    const to = parseInt(toPage, 10)
    if (Number.isNaN(from) || Number.isNaN(to) || from < 1 || to < from) return
    const pages: number[] = []
    for (let i = from; i <= Math.min(to, from + 100); i++) pages.push(i)
    void addPages(pages, `Pages ${from}–${to}`)
  }

  const addList = () => {
    const pages = pagesList
      .split(/[,\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isInteger(n) && n > 0)
    if (pages.length === 0) return
    void addPages(pages, `Pages ${pages.join(', ')}`)
  }

  const submit = () => {
    if (!input.trim() || streaming) return
    onSend(input)
    setInput('')
  }

  const currentSession = sessions.find((s) => s.id === activeSessionId)

  const handleRename = () => {
    if (!activeSessionId) return
    const title = window.prompt('Rename chat', currentSession?.title ?? '')
    if (title && title.trim()) onRenameSession(activeSessionId, title.trim())
  }

  const handleDelete = () => {
    if (!activeSessionId) return
    if (window.confirm('Delete this chat and its messages?')) onDeleteSession(activeSessionId)
  }

  return (
    <div className="sidebar chat-sidebar" style={{ width }}>
      <div className="sidebar-header">
        <span>AI Chat</span>
        <div className="header-actions">
          <button className="tool-btn icon" title="Clear conversation" onClick={onClearChat}>
            <IconTrash />
          </button>
          <button className="tool-btn icon" title="Settings" onClick={onOpenSettings}>
            <IconSettings />
          </button>
          <button className="tool-btn icon" title="Close" onClick={onClose}>
            <IconClose />
          </button>
        </div>
      </div>

      <div className="session-bar">
        <select
          className="session-select"
          value={activeSessionId ?? ''}
          onChange={(e) => {
            const v = e.target.value
            if (v) onSelectSession(v)
          }}
        >
          <option value="" disabled>
            {sessions.length === 0 ? 'No chats yet' : 'Select a chat…'}
          </option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <button className="tool-btn icon" title="New chat" onClick={onNewSession}>
          <IconPlus />
        </button>
        <button
          className="tool-btn icon"
          title="Rename chat"
          disabled={!activeSessionId}
          onClick={handleRename}
        >
          <IconPencil />
        </button>
        <button
          className="tool-btn icon"
          title="Delete chat"
          disabled={!activeSessionId}
          onClick={handleDelete}
        >
          <IconTrash />
        </button>
      </div>

      {!hasApiKey && (
        <div className="chat-warning">
          <p>Add your DeepSeek API key to start chatting.</p>
          <button className="btn" onClick={onOpenSettings}>
            Open Settings
          </button>
        </div>
      )}

      <div className="chat-context">
        <div className="context-tools">
          <button className="chip-add" onClick={addCurrent} disabled={loadingPage || !currentPage}>
            <IconPlus /> Current page
          </button>
          <div className="range-add">
            <input
              className="mini-input"
              placeholder="From"
              value={fromPage}
              onChange={(e) => setFromPage(e.target.value)}
            />
            <input
              className="mini-input"
              placeholder="To"
              value={toPage}
              onChange={(e) => setToPage(e.target.value)}
            />
            <button className="chip-add" onClick={addRange} disabled={loadingPage}>
              <IconPlus /> Range
            </button>
          </div>
          <div className="range-add">
            <input
              className="mini-input grow"
              placeholder="e.g. 1, 3, 5-7"
              value={pagesList}
              onChange={(e) => setPagesList(e.target.value)}
            />
            <button className="chip-add" onClick={addList} disabled={loadingPage}>
              <IconPlus /> Pages
            </button>
          </div>
        </div>

        {context.length > 0 && (
          <div className="context-chips">
            {context.map((c) => (
              <span className="context-chip" key={c.id} title={c.text}>
                <span className="chip-label">{c.label}</span>
                <button className="chip-remove" onClick={() => onRemoveContext(c.id)}>
                  <IconClose />
                </button>
              </span>
            ))}
            <button className="chip-clear" onClick={onClearContext}>
              Clear all
            </button>
          </div>
        )}
      </div>

      <div className="chat-messages" ref={messagesRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Ask questions about the PDF.</p>
            <p className="muted">
              Add the current page, a page range, or select text on the page and click “Add to
              chat”.
            </p>
          </div>
        )}
        {messages.map((t, i) => (
          <div key={i} className={`msg ${t.role}`}>
            <div className="msg-role">{t.role === 'user' ? 'You' : 'AI'}</div>
            <div className="msg-content">
              {t.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.content}</ReactMarkdown>
              ) : (
                t.content
              )}
              {streaming && i === messages.length - 1 && t.role === 'assistant' && (
                <span className="caret" />
              )}
            </div>
          </div>
        ))}
        {error && <div className="msg error">{error}</div>}
      </div>

      <div className="chat-input">
        <textarea
          ref={inputRef}
          className="chat-textarea"
          rows={2}
          placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button className="send-btn" onClick={submit} disabled={streaming || !input.trim()}>
          <IconSend />
        </button>
      </div>
    </div>
  )
}
