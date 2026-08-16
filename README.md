# PDF Reader

A cross-platform desktop PDF reader with an integrated AI chat sidebar. Read a book, and instead of copy-pasting text back and forth to an AI, select text (or the current page / a range of pages) and ask questions directly inside the app.

Built with **Electron + electron-vite + React + TypeScript + pdf.js**, with **SQLite** for chat-session persistence.

## Features

### PDF viewer
- Fast virtualized rendering (only visible pages are painted)
- Table-of-contents sidebar with jump-to-page
- Page navigation, fit-to-width zoom + `Ctrl` + scroll zoom (anchored, no page jump)
- Full-document text search
- Open via dialog, drag-and-drop, or the recent-files list
- Dark / light theme

### Highlighting
- **Highlight mode** toggle — select text to highlight it
- Precise selection: highlights cover exactly what you select (word, sentence, paragraph), not whole lines
- Highlights auto-save to a `.highlights.json` sidecar next to the PDF
- Undo / redo highlighting (`Ctrl+Z` / `Ctrl+Y`)

### AI chat (right sidebar, resizable)
- Streams responses from any OpenAI-compatible API (DeepSeek by default)
- Add context from the document:
  - the **current page**
  - a **page range**
  - **specific pages** (`1, 3, 5-7`)
  - any **selected text**
- Markdown-rendered responses (headings, lists, code, tables, …)
- Multiple **chat sessions per document**, persisted in SQLite

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) + React 18 + TypeScript
- [pdf.js](https://mozilla.github.io/pdf.js/) for rendering and text extraction
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for chat sessions / document state
- [react-markdown](https://github.com/remarkjs/react-markdown) + remark-gfm for AI responses

## Getting started

Requirements: **Node.js 20+** and npm.

> **Note:** `better-sqlite3` is a native module. A `postinstall` script runs `electron-rebuild`, which downloads a prebuilt binary for Electron. If that download fails on your machine, you'll need [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (C++ workload) so it can compile from source. Run `npm run rebuild` anytime your Electron version changes.

```bash
npm install
npm run dev        # launch in development with hot reload
```

## Build & package

```bash
npm run build      # production bundle (out/)
npm run package    # build + create installer (NSIS / DMG / AppImage)
```

## Configuration

Open the app, then **Settings** (gear icon):

- **API key** — your DeepSeek key (`sk-…`)
- **Base URL** — `https://api.deepseek.com` by default; point at any OpenAI-compatible endpoint
- **Model** — `deepseek-chat` or `deepseek-reasoner`
- **Temperature**

The key is stored locally and sent only to the configured Base URL.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open a PDF |
| `Ctrl+K` | Toggle AI chat sidebar |
| `Ctrl+Shift+H` | Toggle highlight mode |
| `Ctrl+Shift+A` | Add current selection to chat |
| `Ctrl+Shift+P` | Add current page to chat |
| `Ctrl+Shift+C` | Toggle chat sidebar (alias) |
| `Ctrl+Z` | Undo highlight |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo highlight |
| `Ctrl` + scroll | Zoom in / out |
| `Enter` | Send chat message (`Shift+Enter` for newline) |
| `Esc` | Close search |

## Data storage

- **Chat sessions & document state** — SQLite database in the app's user-data directory (`sessions.db`)
- **Highlights** — `<yourfile>.pdf.highlights.json` next to the PDF
- **Settings & recent files** — JSON in the app's user-data directory

## Project structure

```
src/
  main/      Electron main process (window, IPC, DeepSeek streaming, SQLite)
  preload/   contextBridge API exposed to the renderer
  shared/    shared TypeScript types
  renderer/  React app (viewer, TOC, chat sidebar, selection/highlight logic)
```
