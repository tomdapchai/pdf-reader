import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import type { Settings, HighlightsFile, ChatRequest, DocumentState, ChatContextItem } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'
import * as db from './db'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

let mainWindow: BrowserWindow | null = null

const userDataDir = app.getPath('userData')
const settingsPath = join(userDataDir, 'settings.json')
const recentPath = join(userDataDir, 'recent.json')

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(userDataDir, { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

function highlightsPathFor(pdfPath: string): string {
  return pdfPath + '.highlights.json'
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    title: 'PDF Reader',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadURL('app://bundle/index.html')
  }
}

function registerProtocol(): void {
  const rendererRoot = join(__dirname, '../renderer')
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/' || pathname === '') pathname = '/index.html'
    const filePath = join(rendererRoot, pathname)
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function registerIpc(): void {
  ipcMain.handle('file:read', async (_e, path: string) => {
    const buf = await readFile(path)
    return buf
  })

  ipcMain.handle('dialog:openPdf', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open PDF',
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('highlights:load', async (_e, pdfPath: string) => {
    const path = highlightsPathFor(pdfPath)
    if (!existsSync(path)) return { version: 1, highlights: [] }
    return readJson<HighlightsFile>(path, { version: 1, highlights: [] })
  })

  ipcMain.handle('highlights:save', async (_e, pdfPath: string, data: HighlightsFile) => {
    try {
      await writeJson(highlightsPathFor(pdfPath), data)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('settings:get', async () => {
    const saved = await readJson<Partial<Settings>>(settingsPath, {})
    return { ...DEFAULT_SETTINGS, ...saved }
  })

  ipcMain.handle('settings:set', async (_e, settings: Settings) => {
    await writeJson(settingsPath, settings)
    return true
  })

  ipcMain.handle('recent:get', async () => {
    return readJson<string[]>(recentPath, [])
  })

  ipcMain.handle('recent:add', async (_e, pdfPath: string) => {
    const list = await readJson<string[]>(recentPath, [])
    const next = [pdfPath, ...list.filter((p) => p !== pdfPath)].slice(0, 10)
    await writeJson(recentPath, next)
    return next
  })

  ipcMain.handle('sessions:list', (_e, pdfPath: string) => db.listSessions(pdfPath))
  ipcMain.handle('sessions:create', (_e, pdfPath: string, title: string) =>
    db.createSession(pdfPath, title)
  )
  ipcMain.handle('sessions:rename', (_e, id: string, title: string) =>
    db.renameSession(id, title)
  )
  ipcMain.handle('sessions:delete', (_e, id: string) => db.deleteSession(id))
  ipcMain.handle('sessions:messages', (_e, sessionId: string) => db.getMessages(sessionId))
  ipcMain.handle(
    'sessions:addMessage',
    (
      _e,
      sessionId: string,
      role: 'user' | 'assistant',
      content: string,
      context: ChatContextItem[] | null
    ) => db.addMessage(sessionId, role, content, context)
  )
  ipcMain.handle('sessions:clearMessages', (_e, sessionId: string) =>
    db.clearMessages(sessionId)
  )
  ipcMain.handle('state:save', (_e, state: DocumentState) => db.saveDocumentState(state))
  ipcMain.handle('state:get', (_e, pdfPath: string) => db.getDocumentState(pdfPath))

  ipcMain.on('chat:stream', async (event, request: ChatRequest & { requestId: string }) => {
    const { requestId, messages, apiKey, baseUrl, model, temperature } = request
    const sender = event.sender

    if (!apiKey) {
      sender.send('chat:error', { requestId, message: 'Missing API key. Add it in Settings.' })
      return
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, messages, temperature, stream: true }),
        signal: controller.signal
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        clearTimeout(timeout)
        sender.send('chat:error', {
          requestId,
          message: `API error ${res.status}: ${body.slice(0, 300)}`
        })
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        clearTimeout(timeout)
        sender.send('chat:error', { requestId, message: 'No response body' })
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      const sendDelta = (delta: string) => {
        if (delta) sender.send('chat:chunk', { requestId, delta })
      }

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const json = JSON.parse(payload)
            const delta = json.choices?.[0]?.delta?.content ?? ''
            sendDelta(delta)
          } catch {
            // ignore partial / non-JSON lines
          }
        }
      }

      clearTimeout(timeout)
      sender.send('chat:done', { requestId })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sender.send('chat:error', { requestId, message })
    }
  })
}

app.whenReady().then(() => {
  registerIpc()
  registerProtocol()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
