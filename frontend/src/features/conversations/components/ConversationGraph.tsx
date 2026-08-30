import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import type { ConversationMessage } from '../types'

const NODE_WIDTH = 264
const NODE_HEIGHT = 132
const X_GAP = 310
const Y_GAP = 166
const MIN_ZOOM = 0.25
const MAX_ZOOM = 1.6
const ZOOM_STEP = 0.1
const VIEWPORT_GUTTER = 24

export function clampCanvasZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(3))))
}

export function anchoredScroll({
  oldZoom,
  newZoom,
  scrollLeft,
  scrollTop,
  localX,
  localY,
}: {
  oldZoom: number
  newZoom: number
  scrollLeft: number
  scrollTop: number
  localX: number
  localY: number
}) {
  const ratio = newZoom / oldZoom
  return {
    left: (scrollLeft + localX) * ratio - localX,
    top: (scrollTop + localY) * ratio - localY,
  }
}

function normalizedWheelDelta(event: WheelEvent, pageSize: number) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * pageSize
  return event.deltaY
}

function setViewportScroll(
  viewport: HTMLDivElement,
  { left, top, behavior = 'auto' }: { left: number; top: number; behavior?: ScrollBehavior },
) {
  if (typeof viewport.scrollTo === 'function') {
    viewport.scrollTo({ left, top, behavior })
    return
  }
  viewport.scrollLeft = left
  viewport.scrollTop = top
}

type Point = { x: number; y: number; depth: number }

export type GraphLayout = {
  points: Map<string, Point>
  width: number
  height: number
}

export function layoutConversation(messages: ConversationMessage[]): GraphLayout {
  const byId = new Map(messages.map((message) => [message.id, message]))
  const children = new Map<string | null, ConversationMessage[]>()
  messages.forEach((message) => {
    const parent = message.parentId && byId.has(message.parentId) ? message.parentId : null
    const siblings = children.get(parent) ?? []
    siblings.push(message)
    children.set(parent, siblings)
  })
  children.forEach((siblings) => siblings.sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  ))

  const points = new Map<string, Point>()
  let nextRow = 0
  let maxDepth = 0
  const visiting = new Set<string>()

  function visit(message: ConversationMessage, depth: number): number {
    if (visiting.has(message.id)) {
      const row = nextRow++
      points.set(message.id, { x: 32 + depth * X_GAP, y: 32 + row * Y_GAP, depth })
      return row
    }
    visiting.add(message.id)
    maxDepth = Math.max(maxDepth, depth)
    const descendants = (children.get(message.id) ?? []).filter((child) => !points.has(child.id))
    let row: number
    if (descendants.length === 0) {
      row = nextRow++
    } else {
      const rows = descendants.map((child) => visit(child, depth + 1))
      row = (Math.min(...rows) + Math.max(...rows)) / 2
    }
    points.set(message.id, { x: 32 + depth * X_GAP, y: 32 + row * Y_GAP, depth })
    visiting.delete(message.id)
    return row
  }

  ;(children.get(null) ?? []).forEach((root) => {
    if (!points.has(root.id)) visit(root, 0)
  })
  messages.forEach((message) => {
    if (!points.has(message.id)) visit(message, 0)
  })

  return {
    points,
    width: Math.max(720, 64 + (maxDepth * X_GAP) + NODE_WIDTH),
    height: Math.max(440, 64 + Math.max(1, nextRow) * Y_GAP),
  }
}

function snippet(content: string) {
  const clean = content
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/[#>*_`\[\]-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > 170 ? `${clean.slice(0, 167)}…` : clean
}

function timeLabel(value: number) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
    .format(new Date(value))
}

type Props = {
  messages: ConversationMessage[]
  selectedId: string | null
  zoom: number
  onZoomChange: (value: number) => void
  onSelect: (message: ConversationMessage) => void
}

export default function ConversationGraph({
  messages,
  selectedId,
  zoom,
  onZoomChange,
  onSelect,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  const pendingZoomRef = useRef<{ zoom: number; left: number; top: number } | null>(null)
  const panRef = useRef<{
    pointerId: number
    clientX: number
    clientY: number
    scrollLeft: number
    scrollTop: number
  } | null>(null)
  const [panning, setPanning] = useState(false)
  const layout = useMemo(() => layoutConversation(messages), [messages])
  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages])
  const branchCounts = useMemo(() => {
    const counts = new Map<string, number>()
    messages.forEach((message) => {
      if (message.parentId) counts.set(message.parentId, (counts.get(message.parentId) ?? 0) + 1)
    })
    return counts
  }, [messages])

  const composerInset = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return 150
    const value = Number.parseFloat(
      getComputedStyle(viewport).getPropertyValue('--nv-canvas-composer-inset'),
    )
    return Number.isFinite(value) ? value : 150
  }, [])

  const visibleHeight = useCallback(() => {
    const viewport = viewportRef.current
    return Math.max(120, (viewport?.clientHeight ?? layout.height) - composerInset())
  }, [composerInset, layout.height])

  const requestZoom = useCallback((value: number, clientX?: number, clientY?: number) => {
    const viewport = viewportRef.current
    if (!viewport) return

    const currentZoom = zoomRef.current
    const nextZoom = clampCanvasZoom(value)
    if (Math.abs(currentZoom - nextZoom) < 0.001) return

    const rect = viewport.getBoundingClientRect()
    const localX = clientX === undefined ? viewport.clientWidth / 2 : clientX - rect.left
    const localY = clientY === undefined ? visibleHeight() / 2 : clientY - rect.top
    const logicalScroll = pendingZoomRef.current ?? {
      zoom: currentZoom,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    }
    const nextScroll = anchoredScroll({
      oldZoom: logicalScroll.zoom,
      newZoom: nextZoom,
      scrollLeft: logicalScroll.left,
      scrollTop: logicalScroll.top,
      localX,
      localY,
    })

    pendingZoomRef.current = { zoom: nextZoom, ...nextScroll }
    zoomRef.current = nextZoom
    onZoomChange(nextZoom)
  }, [onZoomChange, visibleHeight])

  useLayoutEffect(() => {
    zoomRef.current = zoom
    const pending = pendingZoomRef.current
    const viewport = viewportRef.current
    if (!viewport || !pending || Math.abs(pending.zoom - zoom) >= 0.001) return
    viewport.scrollLeft = pending.left
    viewport.scrollTop = pending.top
    pendingZoomRef.current = null
  }, [zoom])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined
    const element = viewport

    function handleWheel(event: WheelEvent) {
      if (window.matchMedia('(max-width: 820px)').matches) return
      const deltaY = normalizedWheelDelta(event, element.clientHeight)

      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const factor = Math.exp(-deltaY * 0.0015)
        requestZoom(zoomRef.current * factor, event.clientX, event.clientY)
        return
      }

      const maxX = Math.max(0, element.scrollWidth - element.clientWidth)
      const maxY = Math.max(0, element.scrollHeight - element.clientHeight)
      if (maxX <= 1 && maxY <= 1) return

      let left = event.deltaX
      let top = deltaY
      if (event.shiftKey) {
        left += deltaY
        top = 0
      } else if (maxY <= 1 && Math.abs(deltaY) >= Math.abs(event.deltaX)) {
        left += deltaY
        top = 0
      }
      const nextLeft = Math.max(0, Math.min(maxX, element.scrollLeft + left))
      const nextTop = Math.max(0, Math.min(maxY, element.scrollTop + top))
      if (nextLeft === element.scrollLeft && nextTop === element.scrollTop) return
      event.preventDefault()
      element.scrollLeft = nextLeft
      element.scrollTop = nextTop
    }

    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [requestZoom])

  const scrollSelectedIntoView = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const viewport = viewportRef.current
    const point = selectedId ? layout.points.get(selectedId) : undefined
    if (!viewport || !point) return

    const nodeLeft = point.x * zoom
    const nodeTop = point.y * zoom
    const nodeRight = nodeLeft + NODE_WIDTH * zoom
    const nodeBottom = nodeTop + NODE_HEIGHT * zoom
    const leftEdge = viewport.scrollLeft + VIEWPORT_GUTTER
    const rightEdge = viewport.scrollLeft + viewport.clientWidth - VIEWPORT_GUTTER
    const topEdge = viewport.scrollTop + VIEWPORT_GUTTER
    const bottomEdge = viewport.scrollTop + visibleHeight() - VIEWPORT_GUTTER
    let left = viewport.scrollLeft
    let top = viewport.scrollTop

    if (nodeLeft < leftEdge) left = Math.max(0, nodeLeft - VIEWPORT_GUTTER)
    else if (nodeRight > rightEdge) left = nodeRight - viewport.clientWidth + VIEWPORT_GUTTER
    if (nodeTop < topEdge) top = Math.max(0, nodeTop - VIEWPORT_GUTTER)
    else if (nodeBottom > bottomEdge) top = nodeBottom - visibleHeight() + VIEWPORT_GUTTER

    if (left !== viewport.scrollLeft || top !== viewport.scrollTop) {
      setViewportScroll(viewport, { left, top, behavior })
    }
  }, [layout.points, selectedId, visibleHeight, zoom])

  useLayoutEffect(() => {
    scrollSelectedIntoView('auto')
  }, [layout.points, messages, selectedId])

  function fitGraph() {
    const viewport = viewportRef.current
    if (!viewport) return
    const availableWidth = Math.max(160, viewport.clientWidth - VIEWPORT_GUTTER * 2)
    const availableHeight = Math.max(120, visibleHeight() - VIEWPORT_GUTTER * 2)
    const nextZoom = clampCanvasZoom(Math.min(
      availableWidth / layout.width,
      availableHeight / layout.height,
    ))
    setViewportScroll(viewport, { left: 0, top: 0 })
    if (Math.abs(zoomRef.current - nextZoom) < 0.001) return
    pendingZoomRef.current = { zoom: nextZoom, left: 0, top: 0 }
    zoomRef.current = nextZoom
    onZoomChange(nextZoom)
  }

  function centerSelected() {
    const viewport = viewportRef.current
    const point = selectedId ? layout.points.get(selectedId) : undefined
    if (!viewport || !point) return
    setViewportScroll(viewport, {
      left: point.x * zoom + NODE_WIDTH * zoom / 2 - viewport.clientWidth / 2,
      top: point.y * zoom + NODE_HEIGHT * zoom / 2 - visibleHeight() / 2,
      behavior: 'smooth',
    })
  }

  function resetView() {
    const viewport = viewportRef.current
    if (!viewport) return
    setViewportScroll(viewport, { left: 0, top: 0 })
    if (Math.abs(zoomRef.current - 1) < 0.001) return
    pendingZoomRef.current = { zoom: 1, left: 0, top: 0 }
    zoomRef.current = 1
    onZoomChange(1)
  }

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 1) return
    event.preventDefault()
    const viewport = viewportRef.current
    if (!viewport) return
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    }
    viewport.setPointerCapture?.(event.pointerId)
    setPanning(true)
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current
    const viewport = viewportRef.current
    if (!pan || !viewport || event.pointerId !== pan.pointerId) return
    event.preventDefault()
    viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX)
    viewport.scrollTop = pan.scrollTop - (event.clientY - pan.clientY)
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current
    const viewport = viewportRef.current
    if (!pan || event.pointerId !== pan.pointerId) return
    if (viewport?.hasPointerCapture?.(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId)
    }
    panRef.current = null
    setPanning(false)
  }

  return (
    <section className="nv-canvas-panel" aria-label="Conversation map">
      <div className="nv-canvas-toolbar" aria-label="Canvas controls">
        <div>
          <span className="nv-canvas-kicker">Branch map</span>
          <strong>{messages.length} messages</strong>
          <small className="nv-canvas-gesture-hint">Wheel to pan · Ctrl/⌘ + wheel to zoom · middle-drag to move</small>
        </div>
        <div className="nv-canvas-tools">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => requestZoom(zoom - ZOOM_STEP)}
            aria-label="Zoom out"
            title="Zoom out around the visible map centre"
            disabled={zoom <= MIN_ZOOM}
          >−</button>
          <output aria-label="Canvas zoom">{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => requestZoom(zoom + ZOOM_STEP)}
            aria-label="Zoom in"
            title="Zoom in around the visible map centre"
            disabled={zoom >= MAX_ZOOM}
          >+</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={fitGraph} aria-label="Fit map">Fit</button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={centerSelected}
            disabled={!selectedId}
            aria-label="Center selected message"
          >Center</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetView} aria-label="Reset canvas view">Reset</button>
        </div>
      </div>

      <div
        className={`nv-canvas-viewport${panning ? ' nv-canvas-viewport--panning' : ''}`}
        ref={viewportRef}
        tabIndex={0}
        aria-label="Conversation canvas viewport"
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onAuxClick={(event) => { if (event.button === 1) event.preventDefault() }}
      >
        <div
          className="nv-graph-stage-wrap"
          style={{ width: layout.width * zoom, height: layout.height * zoom }}
        >
          <div
            className="nv-graph-stage"
            role="tree"
            aria-label="Branching conversation messages"
            style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}
          >
            <svg
              className="nv-graph-edges"
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              aria-hidden="true"
            >
              {messages.map((message) => {
                const child = layout.points.get(message.id)
                const parent = message.parentId ? layout.points.get(message.parentId) : undefined
                if (!child || !parent) return null
                const startX = parent.x + NODE_WIDTH
                const startY = parent.y + NODE_HEIGHT / 2
                const endX = child.x
                const endY = child.y + NODE_HEIGHT / 2
                const curve = Math.max(16, (endX - startX) * 0.48)
                return (
                  <path
                    key={`${message.parentId}-${message.id}`}
                    d={`M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`}
                    className={message.id === selectedId ? 'nv-edge nv-edge--active' : 'nv-edge'}
                  />
                )
              })}
            </svg>

            {messages.map((message) => {
              const point = layout.points.get(message.id)
              if (!point) return null
              const selected = message.id === selectedId
              const parent = message.parentId ? byId.get(message.parentId) : null
              return (
                <button
                  type="button"
                  role="treeitem"
                  aria-level={point.depth + 1}
                  aria-selected={selected}
                  aria-label={`${message.role === 'assistant' ? 'AI' : 'You'} message${parent ? ', has parent' : ', root message'}: ${snippet(message.content)}`}
                  key={message.id}
                  data-message-id={message.id}
                  className={`nv-message-node nv-message-node--${message.role}${selected ? ' nv-message-node--selected' : ''}`}
                  style={{ left: point.x, top: point.y }}
                  onClick={() => onSelect(message)}
                >
                  <span className="nv-node-head">
                    <span className="nv-node-role">{message.role === 'assistant' ? 'NoteVault AI' : 'You'}</span>
                    <time dateTime={new Date(message.createdAt).toISOString()}>{timeLabel(message.createdAt)}</time>
                  </span>
                  <span className="nv-node-snippet">{snippet(message.content)}</span>
                  <span className="nv-node-foot">
                    <span>{selected ? 'Replying from here' : 'Open & branch'}</span>
                    {(branchCounts.get(message.id) ?? 0) > 0 && (
                      <span>{branchCounts.get(message.id)} branches</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
