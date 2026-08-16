import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useCallback
} from 'react'
import PageView, { type PageSelection } from './PageView'
import { getPageBase } from '../lib/pdf'
import type { Highlight } from '@shared/types'

export interface PdfViewerHandle {
  scrollToPage: (page: number) => void
}

interface PdfViewerProps {
  totalPages: number
  zoom: number
  onZoomChange: (zoom: number) => void
  currentPage: number
  onCurrentPageChange: (page: number) => void
  highlights: Highlight[]
  highlightMode: boolean
  selectionColor: string
  activeSelection: PageSelection | null
  onSelection: (sel: PageSelection | null) => void
}

interface Dims {
  width: number
  height: number
}

const GAP = 16
const PAGE_PADDING = 64

const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer(
  {
    totalPages,
    zoom,
    onZoomChange,
    currentPage,
    onCurrentPageChange,
    highlights,
    highlightMode,
    selectionColor,
    activeSelection,
    onSelection
  },
  ref
) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewerWidth, setViewerWidth] = useState(0)
  const [dims, setDims] = useState<Dims[]>([])
  const computeRegistry = useRef(new Map<number, () => PageSelection | null>())
  const currentPageRef = useRef(currentPage)
  const offsetsRef = useRef<number[]>([])
  const heightsRef = useRef<number[]>([])
  const anchorRef = useRef<{ page: number; ratio: number } | null>(null)
  const zoomRef = useRef(zoom)
  const pendingPageRef = useRef<number | null>(null)

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewerWidth(el.clientWidth))
    ro.observe(el)
    setViewerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    if (totalPages === 0) {
      setDims([])
      return
    }
    setDims([])
    const arr: Dims[] = new Array(totalPages)
    let next = 1
    const workers = Array.from({ length: Math.min(6, totalPages) }, async () => {
      while (!cancelled) {
        const i = next
        if (i > totalPages) break
        next = i + 1
        try {
          arr[i - 1] = await getPageBase(i)
        } catch {
          arr[i - 1] = { width: 612, height: 792 }
        }
      }
    })
    Promise.all(workers).then(() => {
      if (!cancelled) setDims(arr)
    })
    return () => {
      cancelled = true
    }
  }, [totalPages])

  const maxWidth = useMemo(() => {
    if (dims.length === 0) return 0
    return Math.max(...dims.map((d) => d.width))
  }, [dims])

  const baseScale = useMemo(() => {
    if (viewerWidth === 0 || maxWidth === 0) return 1
    return Math.min(Math.max((viewerWidth - PAGE_PADDING) / maxWidth, 0.15), 3)
  }, [viewerWidth, maxWidth])

  const scale = baseScale * zoom

  const heights = useMemo(
    () => dims.map((d) => (d?.height ?? 800) * scale + GAP),
    [dims, scale]
  )

  const offsets = useMemo(() => {
    const arr: number[] = []
    let acc = 0
    for (const h of heights) {
      arr.push(acc)
      acc += h
    }
    return arr
  }, [heights])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const prevOffsets = offsetsRef.current
    const prevHeights = heightsRef.current
    if (!el || prevOffsets.length === 0) return
    const center = el.scrollTop + el.clientHeight / 2
    let idx = 0
    for (let i = 0; i < prevOffsets.length; i++) {
      if (prevOffsets[i] <= center) idx = i
      else break
    }
    const pageTop = prevOffsets[idx]
    const pageHeight = Math.max((prevHeights[idx] ?? 0) - GAP, 1)
    const ratio = Math.min(Math.max((center - pageTop) / pageHeight, 0), 1)
    anchorRef.current = { page: idx + 1, ratio }
  }, [scale])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && anchorRef.current && offsets.length > 0) {
      const { page, ratio } = anchorRef.current
      anchorRef.current = null
      const p = Math.min(Math.max(page, 1), offsets.length)
      const pageTop = offsets[p - 1]
      const pageHeight = Math.max((heights[p - 1] ?? 0) - GAP, 1)
      el.scrollTop = pageTop + ratio * pageHeight - el.clientHeight / 2
    }
    offsetsRef.current = offsets
    heightsRef.current = heights
  }, [offsets, heights])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = -Math.sign(e.deltaY) * 0.08
      onZoomChange(zoomRef.current + delta)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onZoomChange])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const top = el.scrollTop + el.clientHeight / 2
        let lo = 0
        let hi = offsets.length - 1
        let idx = 0
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (offsets[mid] <= top) {
            idx = mid
            lo = mid + 1
          } else {
            hi = mid - 1
          }
        }
        const page = idx + 1
        if (page !== currentPageRef.current && page >= 1 && page <= totalPages) {
          currentPageRef.current = page
          onCurrentPageChange(page)
        }
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [offsets, onCurrentPageChange, totalPages])

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage: (page: number) => {
        const target = Math.min(Math.max(page, 1), totalPages)
        if (offsets.length === 0) {
          pendingPageRef.current = target
          return
        }
        const el = scrollRef.current
        if (!el) return
        el.scrollTo({ top: offsets[target - 1] ?? 0, behavior: 'smooth' })
      }
    }),
    [offsets, totalPages]
  )

  useEffect(() => {
    if (pendingPageRef.current == null || offsets.length === 0) return
    const el = scrollRef.current
    if (el) {
      const target = Math.min(Math.max(pendingPageRef.current, 1), totalPages)
      el.scrollTop = offsets[target - 1] ?? 0
    }
    pendingPageRef.current = null
  }, [offsets, totalPages])

  const registerCompute = useCallback((page: number, fn: (() => PageSelection | null) | null) => {
    if (fn) computeRegistry.current.set(page, fn)
    else computeRegistry.current.delete(page)
  }, [])

  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (target?.closest?.('.selection-popover')) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        onSelection(null)
        return
      }
      const node = sel.anchorNode
      let nodeEl: Element | null = null
      if (node instanceof Element) nodeEl = node
      else if (node?.parentElement) nodeEl = node.parentElement
      const pageEl = nodeEl?.closest?.('.page-view') as HTMLElement | null
      const pageNum = pageEl ? Number(pageEl.dataset.page) : NaN
      if (pageNum && computeRegistry.current.has(pageNum)) {
        onSelection(computeRegistry.current.get(pageNum)!())
        return
      }
      onSelection(null)
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [onSelection])

  if (totalPages === 0) {
    return (
      <div className="viewer-scroll" ref={scrollRef}>
        <div className="viewer-empty">
          <p>Open a PDF to start reading.</p>
        </div>
      </div>
    )
  }

  if (dims.length === 0) {
    return (
      <div className="viewer-scroll" ref={scrollRef}>
        <div className="viewer-empty">
          <div className="spinner" />
          <p>Loading document…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="viewer-scroll" ref={scrollRef}>
      <div className="viewer-pages">
        {Array.from({ length: totalPages }, (_, i) => {
          const page = i + 1
          return (
            <PageView
              key={page}
              pageNumber={page}
              scale={scale}
              highlightMode={highlightMode}
              highlights={highlights.filter((h) => h.page === page)}
              selectionColor={selectionColor}
              activeSelection={activeSelection}
              registerCompute={registerCompute}
            />
          )
        })}
      </div>
    </div>
  )
})

export default PdfViewer
