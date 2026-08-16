import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfTextItem {
  str: string
  dir: string
  transform: number[]
  width: number
  height: number
  hasEOL: boolean
  fontName: string
}

export interface PdfTextContent {
  items: PdfTextItem[]
}

export interface TocNode {
  title: string
  pageNumber: number
  children: TocNode[]
}

type PdfDocument = any
type PdfPage = any

let doc: PdfDocument | null = null

export async function loadPdf(data: Uint8Array): Promise<PdfDocument> {
  const loadingTask = getDocument({ data })
  doc = await loadingTask.promise
  return doc
}

export function getDoc(): PdfDocument | null {
  return doc
}

export function hasDoc(): boolean {
  return doc !== null
}

export function closeDoc(): void {
  doc?.destroy()
  doc = null
}

export async function getPage(pageNumber: number): Promise<PdfPage> {
  if (!doc) throw new Error('No document loaded')
  return doc.getPage(pageNumber)
}

export async function getNumPages(): Promise<number> {
  return doc ? doc.numPages : 0
}

export async function getOutline(): Promise<TocNode[]> {
  if (!doc) return []
  const outline = await doc.getOutline()
  if (!outline) return []
  const map = async (items: any[]): Promise<TocNode[]> => {
    const out: TocNode[] = []
    for (const item of items) {
      let pageNumber = 0
      if (typeof item.dest === 'string') {
        try {
          const dest = await doc!.getDestination(item.dest)
          const ref = Array.isArray(dest) ? dest[0] : null
          if (ref) pageNumber = (await doc!.getPageIndex(ref)) + 1
        } catch {
          pageNumber = 0
        }
      } else if (Array.isArray(item.dest)) {
        const ref = item.dest[0]
        try {
          pageNumber = (await doc!.getPageIndex(ref)) + 1
        } catch {
          pageNumber = 0
        }
      }
      const children = item.items ? await map(item.items) : []
      out.push({ title: item.title ?? '', pageNumber, children })
    }
    return out
  }
  return map(outline)
}

export function itemsText(items: PdfTextItem[]): string {
  let text = ''
  for (const item of items) {
    text += item.str
    if (item.hasEOL) text += ' '
  }
  return text.trim()
}

export async function getTextItems(pageNumber: number): Promise<PdfTextItem[]> {
  const page = await getPage(pageNumber)
  const content = (await page.getTextContent()) as PdfTextContent
  return content.items
}

export async function extractPageText(pageNumber: number, maxChars?: number): Promise<string> {
  const items = await getTextItems(pageNumber)
  let text = itemsText(items)
  if (maxChars && text.length > maxChars) text = text.slice(0, maxChars)
  return text
}

export async function extractPagesText(pages: number[], maxCharsPerPage?: number): Promise<string> {
  const parts: string[] = []
  for (const p of pages) {
    const text = await extractPageText(p, maxCharsPerPage)
    parts.push(`--- Page ${p} ---\n${text}`)
  }
  return parts.join('\n\n')
}

const textCache = new Map<number, string>()

export async function getPageTextCached(pageNumber: number): Promise<string> {
  const cached = textCache.get(pageNumber)
  if (cached !== undefined) return cached
  const text = await extractPageText(pageNumber)
  textCache.set(pageNumber, text)
  return text
}

export function clearCaches(): void {
  baseCache.clear()
  textCache.clear()
}

const baseCache = new Map<number, { width: number; height: number }>()

export async function getPageBase(
  pageNumber: number
): Promise<{ width: number; height: number }> {
  const cached = baseCache.get(pageNumber)
  if (cached) return cached
  const page = await getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const dims = { width: viewport.width, height: viewport.height }
  baseCache.set(pageNumber, dims)
  return dims
}
