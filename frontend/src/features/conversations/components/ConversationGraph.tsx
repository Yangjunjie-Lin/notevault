import { useMemo, useRef } from 'react'

import type { ConversationMessage } from '../types'

const NODE_WIDTH = 264
const NODE_HEIGHT = 132
const X_GAP = 310
const Y_GAP = 166

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
  const layout = useMemo(() => layoutConversation(messages), [messages])
  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages])
  const branchCounts = useMemo(() => {
    const counts = new Map<string, number>()
    messages.forEach((message) => {
      if (message.parentId) counts.set(message.parentId, (counts.get(message.parentId) ?? 0) + 1)
    })
    return counts
  }, [messages])

  function fitGraph() {
    const available = viewportRef.current?.clientWidth ?? layout.width
    onZoomChange(Math.max(0.65, Math.min(1.1, (available - 64) / layout.width)))
    viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
  }

  function centerSelected() {
    if (!selectedId) return
    viewportRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }

  return (
    <section className="nv-canvas-panel" aria-label="Conversation map">
      <div className="nv-canvas-toolbar" aria-label="Canvas controls">
        <div>
          <span className="nv-canvas-kicker">Branch map</span>
          <strong>{messages.length} messages</strong>
        </div>
        <div className="nv-canvas-tools">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onZoomChange(Math.max(0.65, Number((zoom - 0.1).toFixed(2))))}
            aria-label="Zoom out"
          >−</button>
          <output aria-label="Canvas zoom">{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onZoomChange(Math.min(1.35, Number((zoom + 0.1).toFixed(2))))}
            aria-label="Zoom in"
          >+</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={fitGraph}>Fit</button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={centerSelected}
            disabled={!selectedId}
          >Center</button>
        </div>
      </div>

      <div className="nv-canvas-viewport" ref={viewportRef} tabIndex={0}>
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
