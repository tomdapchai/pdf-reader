import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import type { Session, StoredMessage, ChatContextItem, DocumentState } from '../shared/types'

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (db) return db
  const path = join(app.getPath('userData'), 'sessions.db')
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      pdf_path TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      context_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS document_state (
      pdf_path TEXT PRIMARY KEY,
      current_page INTEGER NOT NULL DEFAULT 1,
      zoom REAL NOT NULL DEFAULT 1,
      active_session_id TEXT,
      highlight_mode INTEGER NOT NULL DEFAULT 0,
      chat_open INTEGER NOT NULL DEFAULT 0,
      toc_open INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_pdf ON sessions(pdf_path);
  `)
  return db
}

function rowToSession(r: any): Session {
  return {
    id: r.id,
    pdfPath: r.pdf_path,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

function rowToMessage(r: any): StoredMessage {
  return {
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content,
    context: r.context_json ? (JSON.parse(r.context_json) as ChatContextItem[]) : null,
    createdAt: r.created_at
  }
}

export function listSessions(pdfPath: string): Session[] {
  const d = getDb()
  const rows = d
    .prepare('SELECT * FROM sessions WHERE pdf_path = ? ORDER BY updated_at DESC')
    .all(pdfPath)
  return rows.map(rowToSession)
}

export function createSession(pdfPath: string, title: string): Session {
  const d = getDb()
  const id = randomUUID()
  const now = Date.now()
  d.prepare(
    'INSERT INTO sessions (id, pdf_path, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, pdfPath, title || 'New chat', now, now)
  return { id, pdfPath, title: title || 'New chat', createdAt: now, updatedAt: now }
}

export function renameSession(id: string, title: string): void {
  const d = getDb()
  d.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(
    title,
    Date.now(),
    id
  )
}

export function deleteSession(id: string): void {
  const d = getDb()
  d.prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

export function getMessages(sessionId: string): StoredMessage[] {
  const d = getDb()
  const rows = d
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC')
    .all(sessionId)
  return rows.map(rowToMessage)
}

export function addMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  context: ChatContextItem[] | null
): StoredMessage {
  const d = getDb()
  const now = Date.now()
  const info = d
    .prepare(
      'INSERT INTO messages (session_id, role, content, context_json, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(sessionId, role, content, context ? JSON.stringify(context) : null, now)
  d.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId)
  return {
    id: Number(info.lastInsertRowid),
    sessionId,
    role,
    content,
    context,
    createdAt: now
  }
}

export function clearMessages(sessionId: string): void {
  const d = getDb()
  d.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
  d.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), sessionId)
}

export function saveDocumentState(state: DocumentState): void {
  const d = getDb()
  d.prepare(
    `INSERT INTO document_state
       (pdf_path, current_page, zoom, active_session_id, highlight_mode, chat_open, toc_open, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pdf_path) DO UPDATE SET
       current_page = excluded.current_page,
       zoom = excluded.zoom,
       active_session_id = excluded.active_session_id,
       highlight_mode = excluded.highlight_mode,
       chat_open = excluded.chat_open,
       toc_open = excluded.toc_open,
       updated_at = excluded.updated_at`
  ).run(
    state.pdfPath,
    state.currentPage,
    state.zoom,
    state.activeSessionId,
    state.highlightMode ? 1 : 0,
    state.chatOpen ? 1 : 0,
    state.tocOpen ? 1 : 0,
    Date.now()
  )
}

export function getDocumentState(pdfPath: string): DocumentState | null {
  const d = getDb()
  const r = d
    .prepare('SELECT * FROM document_state WHERE pdf_path = ?')
    .get(pdfPath) as any
  if (!r) return null
  return {
    pdfPath: r.pdf_path,
    currentPage: r.current_page,
    zoom: r.zoom,
    activeSessionId: r.active_session_id,
    highlightMode: !!r.highlight_mode,
    chatOpen: !!r.chat_open,
    tocOpen: !!r.toc_open,
    updatedAt: r.updated_at
  }
}
