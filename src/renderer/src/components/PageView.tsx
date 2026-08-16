import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { getPage, getTextItems, getPageBase, type PdfTextItem } from '../lib/pdf'
import type { Highlight, Rect } from '@shared/types'

const ASCENT_RATIO = 0.8

export interface PageSelection {
  page: number
  text: string
  rects: Rect[]
  anchor: { x: number; y: number }
}

interface PageViewProps {
  pageNumber: number
  scale: number
  highlightMode: boolean
  highlights: Highlight[]
  selectionColor: string
  activeSelection: PageSelection | null
  registerCompute: (page: number, fn: (() => PageSelection | null) | null) => void
}

interface Span {
  key: number
  text: string
  itemIndex: number
  left: number
  top: number
  fontSize: number
  angle: number
  scaleX: number
}

interface ItemGeom {
  left: number
  top: number
  width: number
  height: number
}

function multiply(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ]
}

function itemGeom(baseTransform: number[], item: PdfTextItem): ItemGeom {
  const tx = multiply(baseTransform, item.transform)
  const angle = Math.atan2(tx[1], tx[0])
  const fontHeight = Math.hypot(tx[2], tx[3])
  const height = item.height > 0 ? item.height : fontHeight
  const left = tx[4]
  const top = tx[5] - ASCENT_RATIO * height
  const width = item.width
  if (Math.abs(angle) < 0.01) return { left, top, width, height }
  return { left, top: top - Math.sin(angle) * width, width, height }
}

function mergeRects(rects: ItemGeom[]): ItemGeom[] {
  if (rects.length === 0) return []
  const out: ItemGeom[] = []
  let cur: ItemGeom = { ...rects[0] }
  for (let i = 1; i < rects.length; i++) {
    const r = rects[i]
    const sameLine = Math.abs(r.top - cur.top) < cur.height * 0.6
    const gap = r.left - (cur.left + cur.width)
    if (sameLine && gap >= -1 && gap < cur.height * 3) {
      const right = Math.max(cur.left + cur.width, r.left + r.width)
      cur.left = Math.min(cur.left, r.left)
      cur.width = right - cur.left
      cur.top = Math.min(cur.top, r.top)
      cur.height = Math.max(cur.height, r.height)
    } else {
      out.push(cur)
      cur = { ...r }
    }
  }
  out.push(cur)
  return out
}

function boundaryToChar(node: Node, offset: number): { itemIndex: number; char: number } {
  if (node.nodeType === Node.TEXT_NODE) {
    const el = node.parentElement as HTMLElement | null
    const itemIndex = el ? Number(el.dataset.i) : NaN
    return { itemIndex, char: offset }
  }
  const el = node as HTMLElement
  const itemIndex = Number(el.dataset.i)
  if (Number.isNaN(itemIndex)) return { itemIndex: NaN, char: 0 }
  const textNode = el.firstChild
  const len = textNode ? (textNode as Text).data.length : 0
  return { itemIndex, char: offset >= 1 ? len : 0 }
}

interface SelRange {
  itemIndex: number
  start: number
  end: number
}

export default function PageView({
  pageNumber,
  scale,
  highlightMode,
  highlights,
  selectionColor,
  activeSelection,
  registerCompute
}: PageViewProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<any>(null)
  const itemsRef = useRef<PdfTextItem[]>([])
  const baseTransformRef = useRef<number[]>([1, 0, 0, -1, 0, 0])
  const [visible, setVisible] = useState(false)
  const [base, setBase] = useState<{ width: number; height: number } | null>(null)
  const [spans, setSpans] = useState<Span[]>([])
  const [corrections, setCorrections] = useState<number[]>([])
  const [selectionRects, setSelectionRects] = useState<Rect[]>([])

  const computeSelection = useCallback((): PageSelection | null => {
    const sel = window.getSelection()
    const layer = textLayerRef.current
    const pageEl = rootRef.current
    if (!sel || sel.isCollapsed || !layer || !pageEl) return null
    const range = sel.getRangeAt(0)
    if (!layer.contains(range.commonAncestorContainer)) return null

    const items = itemsRef.current
    if (items.length === 0) return null

    const s = boundaryToChar(range.startContainer, range.startOffset)
    const e = boundaryToChar(range.endContainer, range.endOffset)
    if (!Number.isInteger(s.itemIndex) || !Number.isInteger(e.itemIndex)) return null
    if (s.itemIndex < 0 || e.itemIndex < 0) return null
    if (s.itemIndex >= items.length || e.itemIndex >= items.length) return null

    const ranges: SelRange[] = []
    if (s.itemIndex === e.itemIndex) {
      const a = Math.min(s.char, e.char)
      const b = Math.max(s.char, e.char)
      if (b > a) ranges.push({ itemIndex: s.itemIndex, start: a, end: b })
    } else {
      const first = items[s.itemIndex]
      ranges.push({ itemIndex: s.itemIndex, start: s.char, end: first.str.length })
      for (let i = s.itemIndex + 1; i < e.itemIndex; i++) {
        ranges.push({ itemIndex: i, start: 0, end: items[i].str.length })
      }
      ranges.push({ itemIndex: e.itemIndex, start: 0, end: e.char })
    }
    const selRanges = ranges.filter((r) => r.end > r.start)
    if (selRanges.length === 0) return null

    let text = ''
    selRanges.forEach((r, k) => {
      const item = items[r.itemIndex]
      text += item.str.slice(r.start, r.end)
      const isLast = k === selRanges.length - 1
      if (item.hasEOL && (!isLast || r.end === item.str.length)) text += ' '
    })
    text = text.replace(/\s+/g, ' ').trim()
    if (!text) return null

    const baseTransform = baseTransformRef.current
    const pageRect = pageEl.getBoundingClientRect()
    const baseW = pageEl.offsetWidth / scale
    const baseH = pageEl.offsetHeight / scale

    const geoms: ItemGeom[] = selRanges.map((r) => {
      const item = items[r.itemIndex]
      const g = itemGeom(baseTransform, item)
      const total = item.str.length || 1
      const fracStart = r.start / total
      const fracEnd = r.end / total
      return {
        left: g.left + g.width * fracStart,
        top: g.top,
        width: g.width * (fracEnd - fracStart),
        height: g.height
      }
    })

    const merged = mergeRects(geoms)
    const rects: Rect[] = merged.map((m) => ({
      x: m.left / baseW,
      y: m.top / baseH,
      width: m.width / baseW,
      height: m.height / baseH
    }))

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    for (const r of rects) {
      const left = pageRect.left + r.x * baseW * scale
      const top = pageRect.top + r.y * baseH * scale
      const right = left + r.width * baseW * scale
      if (left < minX) minX = left
      if (right > maxX) maxX = right
      if (top < minY) minY = top
    }

    return {
      page: pageNumber,
      text,
      rects,
      anchor: { x: (minX + maxX) / 2, y: minY }
    }
  }, [pageNumber, scale])

  useEffect(() => {
    registerCompute(pageNumber, computeSelection)
    return () => registerCompute(pageNumber, null)
  }, [pageNumber, registerCompute, computeSelection])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setVisible(true)
          else if (entry.boundingClientRect.top > window.innerHeight || entry.boundingClientRect.bottom < 0) {
            setVisible(false)
          }
        }
      },
      { rootMargin: '1200px 0px 1200px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    getPageBase(pageNumber).then((b) => {
      if (!cancelled) setBase(b)
    })
    return () => {
      cancelled = true
    }
  }, [pageNumber])

  useEffect(() => {
    if (!visible || !base) return
    let cancelled = false
    ;(async () => {
      const page = await getPage(pageNumber)
      if (cancelled) return
      const items = await getTextItems(pageNumber)
      if (cancelled) return
      itemsRef.current = items
      const viewport = page.getViewport({ scale: 1 })
      baseTransformRef.current = viewport.transform
      const nextSpans: Span[] = []
      items.forEach((item, itemIndex) => {
        const tx = multiply(viewport.transform, item.transform)
        const angle = Math.atan2(tx[1], tx[0])
        const fontHeight = Math.hypot(tx[2], tx[3])
        const scaleX = Math.hypot(tx[0], tx[1]) / fontHeight
        nextSpans.push({
          key: itemIndex,
          text: item.str,
          itemIndex,
          left: tx[4],
          top: tx[5] - ASCENT_RATIO * fontHeight,
          fontSize: fontHeight,
          angle,
          scaleX
        })
      })
      setSpans(nextSpans)
    })()
    return () => {
      cancelled = true
    }
  }, [visible, base, pageNumber])

  useLayoutEffect(() => {
    const layer = textLayerRef.current
    if (!visible || !layer || spans.length === 0) {
      if (corrections.length !== 0) setCorrections([])
      return
    }
    const els = layer.querySelectorAll<HTMLElement>('span[data-i]')
    const corr: number[] = new Array(spans.length).fill(1)
    els.forEach((el, i) => {
      const item = itemsRef.current[i]
      const span = spans[i]
      if (!item || !span || Math.abs(span.angle) > 0.01) return
      const measured = el.offsetWidth
      if (measured > 0 && item.width > 0) corr[i] = item.width / measured
    })
    setCorrections(corr)
  }, [visible, spans])

  useEffect(() => {
    if (!visible || !base) return
    let cancelled = false
    ;(async () => {
      const page = await getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      renderTaskRef.current?.cancel()
      const task = page.render({
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
      })
      renderTaskRef.current = task
      try {
        await task.promise
      } catch {
        // cancelled
      }
    })()
    return () => {
      cancelled = true
    }
  }, [visible, base, scale, pageNumber])

  useEffect(() => {
    if (!visible) return
    const onSelectionChange = () => {
      const sel = computeSelection()
      setSelectionRects(sel ? sel.rects : [])
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [visible, computeSelection])

  useEffect(() => {
    if (!activeSelection || activeSelection.page !== pageNumber) {
      setSelectionRects([])
    } else {
      setSelectionRects(activeSelection.rects)
    }
  }, [activeSelection, pageNumber])

  const scaled = (r: Rect) => ({
    left: r.x * (base?.width ?? 0),
    top: r.y * (base?.height ?? 0),
    width: r.width * (base?.width ?? 0),
    height: r.height * (base?.height ?? 0)
  })

  return (
    <div
      ref={rootRef}
      className="page-view"
      style={{
        width: (base?.width ?? 0) * scale,
        height: (base?.height ?? 0) * scale
      }}
      data-page={pageNumber}
    >
      <canvas ref={canvasRef} className="page-canvas" />
      <div
        className="page-layer"
        style={{
          width: base?.width ?? 0,
          height: base?.height ?? 0,
          transform: `scale(${scale})`
        }}
      >
        <div className="overlay-layer" style={{ pointerEvents: 'none' }}>
          {highlights.map((h) =>
            h.rects.map((r, i) => (
              <div
                key={`${h.id}-${i}`}
                className="highlight-rect"
                style={{
                  ...scaled(r),
                  backgroundColor: h.color
                }}
              />
            ))
          )}
          {selectionRects.map((r, i) => (
            <div
              key={`sel-${i}`}
              className="selection-rect"
              style={{ ...scaled(r), backgroundColor: selectionColor }}
            />
          ))}
        </div>
        <div
          ref={textLayerRef}
          className={`text-layer${highlightMode ? ' highlight-mode' : ''}`}
        >
          {spans.map((s, i) => (
            <span
              key={s.key}
              data-i={s.itemIndex}
              className="text-span"
              style={{
                left: s.left,
                top: s.top,
                fontSize: s.fontSize,
                transform: `rotate(${s.angle}rad) scaleX(${(corrections[i] ?? 1) * s.scaleX})`
              }}
            >
              {s.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
