import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ChatContextItem,
  ChatMessage,
  Session,
  Settings
} from '@shared/types'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  context?: ChatContextItem[]
}

const SYSTEM_PROMPT =
  'You are a helpful, knowledgeable assistant helping a user who is reading a PDF document. ' +
  'You may be given excerpts of text from the document (with page numbers and selected passages). ' +
  'Use that context to answer accurately and cite page numbers when relevant. ' +
  'If the answer is not in the provided context, say so and answer from general knowledge. ' +
  'Be concise and use markdown formatting when helpful.'

function makeTitle(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim().slice(0, 40)
  return t || 'New chat'
}

function messagesToTurns(msgs: { role: 'user' | 'assistant'; content: string; context: ChatContextItem[] | null }[]): ChatTurn[] {
  return msgs.map((m) => ({
    role: m.role,
    content: m.content,
    context: m.context ?? undefined
  }))
}

function lastUserContext(
  msgs: { role: 'user' | 'assistant'; context: ChatContextItem[] | null }[]
): ChatContextItem[] {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user' && msgs[i].context) return msgs[i].context!
  }
  return []
}

export function useChat(settings: Settings | null, pdfPath: string | null) {
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [context, setContext] = useState<ChatContextItem[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const messagesRef = useRef(messages)
  const contextRef = useRef(context)
  const streamingRef = useRef(streaming)
  const activeSessionIdRef = useRef<string | null>(null)
  const pdfPathRef = useRef(pdfPath)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  useEffect(() => {
    contextRef.current = context
  }, [context])
  useEffect(() => {
    streamingRef.current = streaming
  }, [streaming])
  useEffect(() => {
    pdfPathRef.current = pdfPath
  }, [pdfPath])

  const refreshSessions = useCallback(async () => {
    const p = pdfPathRef.current
    if (p) setSessions(await window.api.listSessions(p))
  }, [])

  useEffect(() => {
    activeSessionIdRef.current = null
    setActiveSessionId(null)
    messagesRef.current = []
    setMessages([])
    setContext([])
    setStreaming(false)
    setError(null)
    if (!pdfPath) {
      setSessions([])
      return
    }
    let cancelled = false
    void (async () => {
      const list = await window.api.listSessions(pdfPath)
      if (cancelled) return
      setSessions(list)
      const state = await window.api.getState(pdfPath)
      if (cancelled || !state?.activeSessionId) return
      const msgs = await window.api.getMessages(state.activeSessionId)
      if (cancelled) return
      const turns = messagesToTurns(msgs)
      messagesRef.current = turns
      setMessages(turns)
      setContext(lastUserContext(msgs))
      activeSessionIdRef.current = state.activeSessionId
      setActiveSessionId(state.activeSessionId)
    })()
    return () => {
      cancelled = true
    }
  }, [pdfPath])

  const addContext = useCallback((item: ChatContextItem) => {
    setContext((prev) => [...prev.filter((c) => c.id !== item.id), item])
  }, [])

  const removeContext = useCallback((id: string) => {
    setContext((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const clearContext = useCallback(() => setContext([]), [])

  const loadSession = useCallback(async (sessionId: string) => {
    const msgs = await window.api.getMessages(sessionId)
    const turns = messagesToTurns(msgs)
    messagesRef.current = turns
    setMessages(turns)
    setContext(lastUserContext(msgs))
    setError(null)
  }, [])

  const selectSession = useCallback(
    async (id: string) => {
      activeSessionIdRef.current = id
      setActiveSessionId(id)
      setStreaming(false)
      await loadSession(id)
    },
    [loadSession]
  )

  const newSession = useCallback(async () => {
    const p = pdfPathRef.current
    if (!p) return
    const s = await window.api.createSession(p, 'New chat')
    activeSessionIdRef.current = s.id
    setActiveSessionId(s.id)
    messagesRef.current = []
    setMessages([])
    setContext([])
    setError(null)
    await refreshSessions()
  }, [refreshSessions])

  const renameSession = useCallback(
    async (id: string, title: string) => {
      await window.api.renameSession(id, title)
      await refreshSessions()
    },
    [refreshSessions]
  )

  const deleteSession = useCallback(
    async (id: string) => {
      await window.api.deleteSession(id)
      if (activeSessionIdRef.current === id) {
        activeSessionIdRef.current = null
        setActiveSessionId(null)
        messagesRef.current = []
        setMessages([])
        setContext([])
      }
      await refreshSessions()
    },
    [refreshSessions]
  )

  const clearChat = useCallback(async () => {
    const sid = activeSessionIdRef.current
    if (sid) await window.api.clearMessages(sid)
    messagesRef.current = []
    setMessages([])
    setContext([])
    setError(null)
  }, [])

  const send = useCallback(
    async (userText: string) => {
      const text = userText.trim()
      if (!text || streamingRef.current || !settings) return
      if (!settings.apiKey) {
        setError('No API key configured. Open Settings to add one.')
        return
      }
      const p = pdfPathRef.current
      if (!p) return

      const hadSession = !!activeSessionIdRef.current
      let sessionId = activeSessionIdRef.current
      if (!sessionId) {
        const s = await window.api.createSession(p, makeTitle(text))
        sessionId = s.id
        activeSessionIdRef.current = sessionId
        setActiveSessionId(sessionId)
        messagesRef.current = []
        setMessages([])
        setContext([])
        void refreshSessions()
      }

      const ctx = contextRef.current
      const ctxBlock = ctx.map((c) => `### ${c.label}\n${c.text}`).join('\n\n')

      await window.api.addMessage(sessionId, 'user', text, ctx.length ? ctx : null)
      void refreshSessions()

      const prevMessages = hadSession ? messagesRef.current : []
      const apiMessages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
      for (const t of prevMessages) {
        apiMessages.push({ role: t.role, content: t.content })
      }
      const userContent = ctxBlock
        ? `Context from the PDF:\n${ctxBlock}\n\nQuestion:\n${text}`
        : text
      apiMessages.push({ role: 'user', content: userContent })

      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text, context: ctx.length ? ctx : undefined },
        { role: 'assistant', content: '' }
      ])
      setStreaming(true)
      setError(null)

      const requestId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)

      let acc = ''
      const unsubscribe = subscribeChat(requestId, {
        onDelta: (delta) => {
          acc += delta
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + delta }
            }
            return next
          })
        },
        onDone: () => {
          unsubscribe()
          setStreaming(false)
          if (acc) void window.api.addMessage(sessionId, 'assistant', acc, null)
          void refreshSessions()
        },
        onError: (message) => {
          unsubscribe()
          setError(message)
          setStreaming(false)
        }
      })

      window.api.startChat({
        requestId,
        messages: apiMessages,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        temperature: settings.temperature
      })
    },
    [settings, refreshSessions]
  )

  return {
    messages,
    context,
    streaming,
    error,
    sessions,
    activeSessionId,
    send,
    addContext,
    removeContext,
    clearContext,
    clearChat,
    newSession,
    selectSession,
    renameSession,
    deleteSession
  }
}

function subscribeChat(
  requestId: string,
  handlers: {
    onDelta: (delta: string) => void
    onDone: () => void
    onError: (message: string) => void
  }
): () => void {
  const offChunk = window.api.onChatChunk((payload) => {
    if (payload.requestId === requestId) handlers.onDelta(payload.delta)
  })
  const offDone = window.api.onChatDone((payload) => {
    if (payload.requestId === requestId) handlers.onDone()
  })
  const offError = window.api.onChatError((payload) => {
    if (payload.requestId === requestId) handlers.onError(payload.message)
  })
  return () => {
    offChunk()
    offDone()
    offError()
  }
}
