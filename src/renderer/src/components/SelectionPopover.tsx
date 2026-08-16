import { useEffect, useRef } from 'react'
import type { PageSelection } from './PageView'
import { IconClose } from './icons'

interface SelectionPopoverProps {
  selection: PageSelection
  showHighlight: boolean
  onAddToChat: (sel: PageSelection) => void
  onHighlight: (sel: PageSelection) => void
  onCopy: (text: string) => void
  onDismiss: () => void
}

export default function SelectionPopover({
  selection,
  showHighlight,
  onAddToChat,
  onHighlight,
  onCopy,
  onDismiss
}: SelectionPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let { x, y } = selection.anchor
    x = Math.min(Math.max(x, rect.width / 2 + 8), window.innerWidth - rect.width / 2 - 8)
    y = Math.max(y - 12, 8)
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [selection])

  return (
    <div
      ref={ref}
      className="selection-popover"
      style={{ transform: 'translate(-50%, -100%)' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button className="popover-btn primary" onClick={() => onAddToChat(selection)}>
        Add to chat
      </button>
      {showHighlight && (
        <button className="popover-btn" onClick={() => onHighlight(selection)}>
          Highlight
        </button>
      )}
      <button className="popover-btn" onClick={() => onCopy(selection.text)}>
        Copy
      </button>
      <button className="popover-btn icon" title="Dismiss" onClick={onDismiss}>
        <IconClose />
      </button>
    </div>
  )
}
