import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getIdToken } from '../auth/firebase'
import { notesApi } from './api'

vi.mock('../auth/firebase', () => ({ getIdToken: vi.fn() }))

const note = {
  id: 'note/1',
  text: 'Updated',
  tags: ['work'],
  createdAt: 1000,
  updatedAt: 2000,
}

describe('notes API contract adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getIdToken).mockResolvedValue('test-token')
  })

  it('sends the exact PATCH payload and authenticated headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ note }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    await expect(notesApi.update('note/1', { text: 'Updated', tags: ['work'] }))
      .resolves.toEqual({ note })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8000/notes/note%2F1')
    expect(options.method).toBe('PATCH')
    expect(options.body).toBe(JSON.stringify({ text: 'Updated', tags: ['work'] }))
    const headers = new Headers(options.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-token')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('serializes pagination and filter parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ notes: [], hasMore: false, nextCursor: null, searchLimited: false }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await notesApi.list(
      { q: 'meeting', tag: 'work', limit: 20, cursor: 'opaque' },
      controller.signal,
    )

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/notes?q=meeting&tag=work&limit=20&cursor=opaque',
    )
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })

  it('surfaces sanitized JSON API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: 'Notes are temporarily unavailable. Please try again.' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )))

    await expect(notesApi.delete('note-1')).rejects.toThrow(
      'Notes are temporarily unavailable. Please try again.',
    )
  })
})
