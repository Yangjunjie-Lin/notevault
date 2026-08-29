import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ConversationMessage } from '../types'
import ConversationGraph, { layoutConversation } from './ConversationGraph'

const messages: ConversationMessage[] = [
  { id: 'root', parentId: null, role: 'user', content: 'Root idea', createdAt: 1 },
  { id: 'answer', parentId: 'root', role: 'assistant', content: 'First answer', createdAt: 2 },
  { id: 'branch-a', parentId: 'answer', role: 'user', content: 'Main branch', createdAt: 3 },
  { id: 'branch-b', parentId: 'answer', role: 'user', content: 'Alternative branch', createdAt: 4 },
]

describe('ConversationGraph', () => {
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
})
