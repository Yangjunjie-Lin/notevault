import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { checkpointsApi, conversationsApi } from '../api'
import type { Checkpoint, ConversationDetail, ConversationSummary } from '../types'
import ConversationWorkspace from './ConversationWorkspace'

vi.mock('../api', () => ({
  conversationsApi: {
    list: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    start: vi.fn(),
    reply: vi.fn(),
    suggest: vi.fn(),
    capture: vi.fn(),
  },
  checkpointsApi: {
    list: vi.fn(),
    update: vi.fn(),
  },
}))

const summary: ConversationSummary = {
  id: 'conversation-1',
  title: 'Release map',
  createdAt: 100,
  updatedAt: 200,
  messageCount: 2,
}

const detail: ConversationDetail = {
  ...summary,
  messages: [
    { id: 'message-1', parentId: null, role: 'user', content: 'Plan the release', createdAt: 100 },
    { id: 'message-2', parentId: 'message-1', role: 'assistant', content: 'Start with a safe preview.', createdAt: 101 },
  ],
}

const checkpoint: Checkpoint = {
  id: 'checkpoint-1',
  title: 'Run preview',
  details: 'Validate the feature branch.',
  completed: false,
  sourceConversationId: 'conversation-1',
  sourceMessageId: 'message-2',
  createdAt: 300,
  completedAt: null,
}

describe('ConversationWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(conversationsApi.list).mockResolvedValue({ conversations: [] })
    vi.mocked(checkpointsApi.list).mockResolvedValue({ checkpoints: [] })
    vi.mocked(conversationsApi.start).mockResolvedValue(detail)
    vi.mocked(conversationsApi.get).mockResolvedValue(detail)
    vi.mocked(conversationsApi.remove).mockResolvedValue({ ok: true })
    vi.mocked(conversationsApi.reply).mockResolvedValue({
      ...detail,
      updatedAt: 400,
      messageCount: 4,
      messages: [
        ...detail.messages,
        { id: 'message-3', parentId: 'message-1', role: 'user', content: 'Alternative', createdAt: 300 },
        { id: 'message-4', parentId: 'message-3', role: 'assistant', content: 'Alternative answer', createdAt: 301 },
      ],
    })
    vi.mocked(conversationsApi.suggest).mockResolvedValue({
      suggestions: [
        { id: 'candidate-note', kind: 'note', title: 'Release note', content: 'Use a preview.' },
        { id: 'candidate-task', kind: 'checkpoint', title: 'Run preview', content: 'Validate it.' },
      ],
      model: 'test-model',
      traceId: null,
    })
    vi.mocked(conversationsApi.capture).mockResolvedValue({
      notes: [{ id: 'note-1', text: '# Release note\n\nUse a preview.', tags: ['ai-captured'], createdAt: 500, updatedAt: null }],
      checkpoints: [checkpoint],
    })
    vi.mocked(checkpointsApi.update).mockResolvedValue({
      checkpoint: { ...checkpoint, completed: true, completedAt: 600 },
    })
  })

  it('starts a private conversation from the empty visual state', async () => {
    const onBlockingChange = vi.fn()
    render(<ConversationWorkspace onNotesCaptured={vi.fn()} onBlockingChange={onBlockingChange} />)
    expect(await screen.findByRole('heading', { name: /Turn a conversation into a map/i })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Start a conversation'), { target: { value: 'Plan the release' } })
    fireEvent.click(screen.getByRole('button', { name: /^Start$/ }))

    await waitFor(() => expect(conversationsApi.start).toHaveBeenCalledWith(
      'Plan the release', expect.any(String), expect.any(AbortSignal),
    ))
    expect(await screen.findByRole('treeitem', { name: /Start with a safe preview/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Reply to selected message')).toHaveValue('')
    expect(onBlockingChange).toHaveBeenCalledWith(true)
    expect(onBlockingChange).toHaveBeenLastCalledWith(false)
  })

  it('loads a saved map and branches from an earlier selected message', async () => {
    vi.mocked(conversationsApi.list).mockResolvedValue({ conversations: [summary] })
    render(<ConversationWorkspace onNotesCaptured={vi.fn()} />)
    const root = await screen.findByRole('treeitem', { name: /Root message: Plan the release/i })

    fireEvent.click(root)
    fireEvent.change(screen.getByLabelText('Reply to selected message'), { target: { value: 'Alternative' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add branch' }))

    await waitFor(() => expect(conversationsApi.reply).toHaveBeenCalledWith(
      'conversation-1',
      'message-1',
      'Alternative',
      expect.any(String),
      expect.any(AbortSignal),
    ))
    expect(await screen.findByRole('treeitem', { name: /Alternative answer/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('requires item-level confirmation before captured data reaches notes and checkpoints', async () => {
    vi.mocked(conversationsApi.list).mockResolvedValue({ conversations: [summary] })
    const onNotesCaptured = vi.fn()
    render(<ConversationWorkspace onNotesCaptured={onNotesCaptured} />)
    await screen.findByRole('treeitem', { name: /Start with a safe preview/i })

    fireEvent.click(screen.getByRole('button', { name: 'Capture ideas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Review capture candidates' })
    expect(conversationsApi.capture).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('button', { name: 'Save selected (0)' })).toBeDisabled()

    fireEvent.click(await within(dialog).findByLabelText('Include candidate 1'))
    fireEvent.click(await within(dialog).findByLabelText('Include candidate 2'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save selected (2)' }))

    await waitFor(() => expect(conversationsApi.capture).toHaveBeenCalledWith(
      'conversation-1',
      'message-2',
      expect.any(String),
      [
        { kind: 'note', title: 'Release note', content: 'Use a preview.' },
        { kind: 'checkpoint', title: 'Run preview', content: 'Validate it.' },
      ],
    ))
    expect(onNotesCaptured).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'note-1' }),
    ]))
    const task = await screen.findByText('Run preview')
    const checkbox = task.closest('label')!.querySelector('input')!
    fireEvent.click(checkbox)
    await waitFor(() => expect(checkpointsApi.update).toHaveBeenCalledWith('checkpoint-1', true))
  })

  it('preserves an unsent message when generation fails and supports a clean new map', async () => {
    vi.mocked(conversationsApi.start).mockRejectedValueOnce(new Error('Provider unavailable'))
    render(<ConversationWorkspace onNotesCaptured={vi.fn()} />)
    await screen.findByRole('heading', { name: /Turn a conversation into a map/i })
    const input = screen.getByLabelText('Start a conversation')
    fireEvent.change(input, { target: { value: 'Keep this exact draft' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider unavailable')
    expect(input).toHaveValue('Keep this exact draft')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('switches between saved conversations and opens a new unsent map', async () => {
    const second = { ...summary, id: 'conversation-2', title: 'Second map', updatedAt: 300 }
    vi.mocked(conversationsApi.list).mockResolvedValue({ conversations: [summary, second] })
    vi.mocked(conversationsApi.get)
      .mockResolvedValueOnce({ ...detail, ...second })
      .mockResolvedValueOnce(detail)
    render(<ConversationWorkspace onNotesCaptured={vi.fn()} />)
    await screen.findAllByRole('treeitem')

    fireEvent.click(screen.getByRole('button', { name: /Release map/i }))
    await waitFor(() => expect(conversationsApi.get).toHaveBeenLastCalledWith('conversation-1'))
    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    expect(await screen.findByLabelText('Start a conversation')).toHaveValue('')
  })

  it('deletes a persisted map only after confirmation', async () => {
    vi.mocked(conversationsApi.list).mockResolvedValue({ conversations: [summary] })
    render(<ConversationWorkspace onNotesCaptured={vi.fn()} />)
    await screen.findByRole('treeitem', { name: /Start with a safe preview/i })

    fireEvent.click(screen.getByRole('button', { name: 'Delete map' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this conversation map?' })
    expect(dialog).toHaveTextContent('Notes and checkpoints you already confirmed will be kept')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete map' }))

    await waitFor(() => expect(conversationsApi.remove).toHaveBeenCalledWith('conversation-1'))
    expect(await screen.findByRole('heading', { name: /Turn a conversation into a map/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Release map/i })).not.toBeInTheDocument()
  })
})
