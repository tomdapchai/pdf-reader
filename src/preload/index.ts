import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Settings,
  HighlightsFile,
  ChatRequest,
  ChatChunk,
  ChatDone,
  ChatError,
  Session,
  StoredMessage,
  DocumentState,
  ChatContextItem
} from '../shared/types'

const api = {
  openPdf: (): Promise<string | null> => ipcRenderer.invoke('dialog:openPdf'),
  readFile: (path: string): Promise<Uint8Array> => ipcRenderer.invoke('file:read', path),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  loadHighlights: (pdfPath: string): Promise<HighlightsFile> =>
    ipcRenderer.invoke('highlights:load', pdfPath),
  saveHighlights: (pdfPath: string, data: HighlightsFile): Promise<boolean> =>
    ipcRenderer.invoke('highlights:save', pdfPath, data),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: Settings): Promise<boolean> =>
    ipcRenderer.invoke('settings:set', settings),
  getRecent: (): Promise<string[]> => ipcRenderer.invoke('recent:get'),
  addRecent: (pdfPath: string): Promise<string[]> => ipcRenderer.invoke('recent:add', pdfPath),

  listSessions: (pdfPath: string): Promise<Session[]> =>
    ipcRenderer.invoke('sessions:list', pdfPath),
  createSession: (pdfPath: string, title: string): Promise<Session> =>
    ipcRenderer.invoke('sessions:create', pdfPath, title),
  renameSession: (id: string, title: string): Promise<void> =>
    ipcRenderer.invoke('sessions:rename', id, title),
  deleteSession: (id: string): Promise<void> => ipcRenderer.invoke('sessions:delete', id),
  getMessages: (sessionId: string): Promise<StoredMessage[]> =>
    ipcRenderer.invoke('sessions:messages', sessionId),
  addMessage: (
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    context: ChatContextItem[] | null
  ): Promise<StoredMessage> =>
    ipcRenderer.invoke('sessions:addMessage', sessionId, role, content, context),
  clearMessages: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke('sessions:clearMessages', sessionId),
  saveState: (state: DocumentState): Promise<void> => ipcRenderer.invoke('state:save', state),
  getState: (pdfPath: string): Promise<DocumentState | null> =>
    ipcRenderer.invoke('state:get', pdfPath),

  startChat: (request: ChatRequest & { requestId: string }): void => {
    ipcRenderer.send('chat:stream', request)
  },
  onChatChunk: (cb: (payload: ChatChunk) => void): (() => void) => {
    const listener = (_e: unknown, payload: ChatChunk) => cb(payload)
    ipcRenderer.on('chat:chunk', listener)
    return () => ipcRenderer.removeListener('chat:chunk', listener)
  },
  onChatDone: (cb: (payload: ChatDone) => void): (() => void) => {
    const listener = (_e: unknown, payload: ChatDone) => cb(payload)
    ipcRenderer.on('chat:done', listener)
    return () => ipcRenderer.removeListener('chat:done', listener)
  },
  onChatError: (cb: (payload: ChatError) => void): (() => void) => {
    const listener = (_e: unknown, payload: ChatError) => cb(payload)
    ipcRenderer.on('chat:error', listener)
    return () => ipcRenderer.removeListener('chat:error', listener)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
