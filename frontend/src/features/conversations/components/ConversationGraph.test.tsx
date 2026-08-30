import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConversationMessage } from '../types'
import ConversationGraph, {
  anchoredScroll,
  clampCanvasZoom,
  layoutConversation,
} from './ConversationGraph'

const messages: ConversationMessage[] = [
  { id: 'root', parentId: null, role: 'user', content: 'Root idea', createdAt: 1 },
  { id: 'answer', parentId: 'root', role: 'assistant', content: 'First answer', createdAt: 2 },
  { id: 'branch-a', parentId: 'answer', role: 'user', content: 'Main branch', createdAt: 3 },
  { id: 'branch-b', parentId: 'answer', role: 'user', content: 'Alternative branch', createdAt: 4 },
]

function GraphHarness({ onSelect = vi.fn() }: { onSelect?: (message: ConversationMessage) => void }) {
  const [zoom, setZoom] = useState(0.9)
  return (
    <ConversationGraph
      messages={messages}
      selectedId="answer"
      zoom={zoom}
      onZoomChange={setZoom}
      onSelect={onSelect}
    />
  )
}

function prepareViewport(viewport: HTMLElement) {
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: 700 },
    clientHeight: { configurable: true, value: 600 },
    scrollWidth: { configurable: true, value: 1_400 },
    scrollHeight: { configurable: true, value: 500 },
  })
  Object.defineProperty(viewport, 'scrollLeft', { configurable: true, writable: true, value: 120 })
  Object.defineProperty(viewport, 'scrollTop', { configurable: true, writable: true, value: 80 })
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: 50,
    left: 100,
    top: 50,
    right: 800,
    bottom: 650,
    width: 700,
    height: 600,
    toJSON: () => ({}),
  })
  Object.defineProperty(viewport, 'scrollTo', {
    configurable: true,
    value: vi.fn(({ left = viewport.scrollLeft, top = viewport.scrollTop }) => {
      viewport.scrollLeft = left
      viewport.scrollTop = top
    }),
  })
  Object.defineProperty(viewport, 'scrollBy', {
    configurable: true,
    value: vi.fn(({ left = 0, top = 0 }) => {
      viewport.scrollLeft += left
      viewport.scrollTop += top
    }),
  })
}

describe('ConversationGraph', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
  })

  it('lays out descendants to the right and separates sibling branches', () => {
    const layout = layoutConversation(messages)

    expect(layout.points.get('answer')!.x).toBeGreaterThan(layout.points.get('root')!.x)
    expect(layout.points.get('branch-a')!.x).toBeGreaterThan(layout.points.get('answer')!.x)
    expect(layout.points.get('branch-a')!.y).not.toBe(layout.points.get('branch-b')!.y)
    expect(layout.width).toBeGreaterThanOrEqual(720)
  })

  it('keeps orphaned and cyclic data reachable in the accessible tree', () => {
    const malformed: ConversationMessage[] = [
      { id: 'orphan', parentId: 'missing', role: 'user', content: 'orphan', createdAt: 1 },
      { id: 'cycle-a', parentId: 'cycle-b', role: 'assistant', content: 'a', createdAt: 2 },
      { id: 'cycle-b', parentId: 'cycle-a', role: 'user', content: 'b', createdAt: 3 },
    ]

    const layout = layoutConversation(malformed)

    expect([...layout.points.keys()].sort()).toEqual(['cycle-a', 'cycle-b', 'orphan'])
  })

  it('announces roles, branch counts, selection, and zoom controls', () => {
    const onSelect = vi.fn()
    const onZoomChange = vi.fn()
    render(
      <ConversationGraph
        messages={messages}
        selectedId="answer"
        zoom={0.9}
        onZoomChange={onZoomChange}
        onSelect={onSelect}
      />,
    )

    const branch = screen.getByRole('treeitem', { name: /Alternative branch/i })
    fireEvent.click(branch)
    expect(onSelect).toHaveBeenCalledWith(messages[3])
    expect(screen.getByRole('treeitem', { name: /First answer/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('2 branches')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(onZoomChange).toHaveBeenNthCalledWith(1, 1)
    expect(onZoomChange).toHaveBeenNthCalledWith(2, 0.8)
  })

  it('clamps zoom and keeps the pointer world position stable', () => {
    expect(clampCanvasZoom(0.01)).toBe(0.25)
    expect(clampCanvasZoom(4)).toBe(1.6)
    const anchored = anchoredScroll({
      oldZoom: 0.8,
      newZoom: 1.2,
      scrollLeft: 200,
      scrollTop: 100,
      localX: 300,
      localY: 180,
    })
    expect(anchored.left).toBeCloseTo(450)
    expect(anchored.top).toBeCloseTo(240)
  })

  it('uses Ctrl/Meta + wheel for pointer-anchored zoom and ordinary wheel for panning', async () => {
    render(<GraphHarness />)
    const viewport = screen.getByLabelText('Conversation canvas viewport')
    prepareViewport(viewport)
    viewport.scrollTop = 0

    const pointer = { clientX: 400, clientY: 250 }
    const beforeWorldX = (viewport.scrollLeft + pointer.clientX - 100) / 0.9
    const beforeWorldY = (viewport.scrollTop + pointer.clientY - 50) / 0.9
    const zoomEvent = new WheelEvent('wheel', {
      ...pointer,
      deltaY: -100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(viewport, zoomEvent)

    await waitFor(() => expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('105%'))
    expect(zoomEvent.defaultPrevented).toBe(true)
    const nextZoom = 1.046
    expect((viewport.scrollLeft + pointer.clientX - 100) / nextZoom).toBeCloseTo(beforeWorldX, 1)
    expect((viewport.scrollTop + pointer.clientY - 50) / nextZoom).toBeCloseTo(beforeWorldY, 1)

    const zoomBeforePan = screen.getByLabelText('Canvas zoom').textContent
    const panEvent = new WheelEvent('wheel', {
      deltaY: 80,
      bubbles: true,
      cancelable: true,
    })
    const leftBeforePan = viewport.scrollLeft
    fireEvent(viewport, panEvent)
    expect(panEvent.defaultPrevented).toBe(true)
    expect(viewport.scrollLeft).toBe(leftBeforePan + 80)
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent(zoomBeforePan ?? '')
  })

  it('pans with middle-button dragging and releases pointer capture', () => {
    const onSelect = vi.fn()
    render(<GraphHarness onSelect={onSelect} />)
    const viewport = screen.getByLabelText('Conversation canvas viewport')
    prepareViewport(viewport)
    const setPointerCapture = vi.fn()
    const releasePointerCapture = vi.fn()
    Object.defineProperties(viewport, {
      setPointerCapture: { configurable: true, value: setPointerCapture },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: releasePointerCapture },
    })

    fireEvent.pointerDown(viewport, { button: 1, pointerId: 7, clientX: 300, clientY: 220 })
    fireEvent.pointerMove(viewport, { pointerId: 7, clientX: 240, clientY: 170 })
    expect(viewport.scrollLeft).toBe(180)
    expect(viewport.scrollTop).toBe(130)
    expect(setPointerCapture).toHaveBeenCalledWith(7)
    expect(viewport).toHaveClass('nv-canvas-viewport--panning')

    fireEvent.pointerUp(viewport, { pointerId: 7 })
    expect(releasePointerCapture).toHaveBeenCalledWith(7)
    expect(viewport).not.toHaveClass('nv-canvas-viewport--panning')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('resets panning even when the canvas is already at 100%', async () => {
    render(<GraphHarness />)
    const viewport = screen.getByLabelText('Conversation canvas viewport')
    prepareViewport(viewport)

    fireEvent.click(screen.getByRole('button', { name: 'Reset canvas view' }))
    await waitFor(() => expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('100%'))
    expect(viewport.scrollLeft).toBe(0)
    expect(viewport.scrollTop).toBe(0)

    viewport.scrollLeft = 220
    viewport.scrollTop = 40
    fireEvent.click(screen.getByRole('button', { name: 'Reset canvas view' }))
    expect(viewport.scrollLeft).toBe(0)
    expect(viewport.scrollTop).toBe(0)
  })
})
