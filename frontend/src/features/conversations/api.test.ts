import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getIdToken } from '../auth/firebase'
import { checkpointsApi, conversationsApi } from './api'

vi.mock('../auth/firebase', () => ({ getIdToken: vi.fn() }))

describe('conversation API adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ conversations: [], checkpoints: [] }),
    }))
    vi.mocked(getIdToken).mockResolvedValue('firebase-token')
  })

  it('starts and branches through authenticated, server-owned AI endpoints', async () => {
    await conversationsApi.start('Root', 'request-root-001')
    await conversationsApi.reply('conversation/a', 'message/b', 'Branch', 'request-branch-001')

    expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8000/conversations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: 'Root', clientRequestId: 'request-root-001' }),
      headers: expect.any(Headers),
    }))
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/conversations/conversation%2Fa/messages',
      expect.objectContaining({
        body: JSON.stringify({
          parentId: 'message/b',
          text: 'Branch',
          clientRequestId: 'request-branch-001',
        }),
      }),
    )
    const headers = vi.mocked(fetch).mock.calls[0][1]!.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer firebase-token')
  })

  it('loads maps, prepares candidates, and captures only explicit items', async () => {
    const signal = new AbortController().signal
    await conversationsApi.list(signal)
    await conversationsApi.get('conversation/id', signal)
    await conversationsApi.suggest('conversation/id', 'message/id', 'notes', signal)
    await conversationsApi.capture('conversation/id', 'message/id', 'capture-001', [{
      kind: 'note',
      title: 'Approved',
      content: 'Only this item.',
    }])

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/conversations/conversation%2Fid',
      expect.objectContaining({ signal }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:8000/conversations/conversation%2Fid/suggestions',
      expect.objectContaining({
        body: JSON.stringify({ messageId: 'message/id', intent: 'notes' }),
        signal,
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      'http://localhost:8000/conversations/conversation%2Fid/captures',
      expect.objectContaining({
        body: JSON.stringify({
          sourceMessageId: 'message/id',
          clientRequestId: 'capture-001',
          items: [{ kind: 'note', title: 'Approved', content: 'Only this item.' }],
        }),
      }),
    )
  })

  it('lists and updates checkpoints without exposing Firestore directly', async () => {
    const signal = new AbortController().signal
    await checkpointsApi.list(signal)
    await checkpointsApi.update('task/1', true)

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/checkpoints',
      expect.objectContaining({ signal }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/checkpoints/task%2F1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ completed: true }) }),
    )
  })
})
