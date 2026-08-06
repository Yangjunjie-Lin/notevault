import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getIdToken } from '../auth/firebase'
import { aiApi } from './api'

vi.mock('../auth/firebase', () => ({ getIdToken: vi.fn() }))

describe('AI API contract adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getIdToken).mockResolvedValue('firebase-id-token')
  })

  it('formats Markdown through the authenticated NoteVault backend', async () => {
    const response = {
      text: '# Formatted',
      changed: true,
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      traceId: 'trace-1',
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await expect(aiApi.formatMarkdown({ text: '#Formatted' }, controller.signal))
      .resolves.toEqual(response)

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8000/ai/format-markdown')
    expect(options.method).toBe('POST')
    expect(options.signal).toBe(controller.signal)
    expect(options.body).toBe(JSON.stringify({ text: '#Formatted' }))
    const headers = new Headers(options.headers)
    expect(headers.get('Authorization')).toBe('Bearer firebase-id-token')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('sends only Markdown and the editing instruction for revision', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      text: 'Revised',
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      traceId: null,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await aiApi.reviseNote({ text: 'Draft', instruction: 'Make it concise.' })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8000/ai/revise-note')
    expect(options.body).toBe(JSON.stringify({ text: 'Draft', instruction: 'Make it concise.' }))
    expect(JSON.parse(String(options.body))).toEqual({
      text: 'Draft', instruction: 'Make it concise.',
    })
  })

  it('surfaces the backend sanitized error and ignores unknown JSON fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: 'AI service is temporarily unavailable',
      upstream: 'must not be displayed',
    }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })))

    await expect(aiApi.formatMarkdown({ text: 'Draft' })).rejects.toThrow(
      'AI service is temporarily unavailable',
    )
  })

  it('does not expose an unexpected non-JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      '<html>internal proxy detail</html>',
      { status: 502, headers: { 'content-type': 'text/html' } },
    )))

    await expect(aiApi.formatMarkdown({ text: 'Draft' })).rejects.toThrow(
      'Request failed with status 502',
    )
  })
})
