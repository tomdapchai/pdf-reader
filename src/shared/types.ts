export type Theme = 'light' | 'dark'

export interface Settings {
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
  maxContextChars: number
  theme: Theme
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxContextChars: 12000,
  theme: 'dark'
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Highlight {
  id: string
  page: number
  text: string
  rects: Rect[]
  color: string
  createdAt: number
}

export interface HighlightsFile {
  version: number
  highlights: Highlight[]
}

export interface TocItem {
  title: string
  pageNumber: number
  children: TocItem[]
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
}

export interface ChatChunk {
  requestId: string
  delta: string
}

export interface ChatDone {
  requestId: string
}

export interface ChatError {
  requestId: string
  message: string
}

export type PageRef =
  | { type: 'current'; page: number }
  | { type: 'range'; from: number; to: number }
  | { type: 'pages'; pages: number[] }

export interface ChatContextItem {
  id: string
  kind: 'page' | 'selection'
  label: string
  page: number
  text: string
}

export interface Session {
  id: string
  pdfPath: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface StoredMessage {
  id: number
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  context: ChatContextItem[] | null
  createdAt: number
}

export interface DocumentState {
  pdfPath: string
  currentPage: number
  zoom: number
  activeSessionId: string | null
  highlightMode: boolean
  chatOpen: boolean
  tocOpen: boolean
  updatedAt: number
}
