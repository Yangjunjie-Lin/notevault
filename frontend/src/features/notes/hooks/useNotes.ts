import { useCallback, useEffect, useRef, useState } from 'react'

import { notesApi } from '../api'
import type { Note, NoteFilters, NoteInput } from '../types'

const PAGE_SIZE = 20

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function noteMatchesFilters(note: Note, filters: NoteFilters) {
  const query = filters.q.trim().toLowerCase()
  const tag = filters.tag.trim().toLowerCase()
  const tags = note.tags ?? []
  const searchable = `${note.text} ${tags.join(' ')}`.toLowerCase()
  return (!query || searchable.includes(query)) && (!tag || tags.includes(tag))
}

function sortNotes(notes: Note[]) {
  return [...notes].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
}

function mergeNotes(current: Note[], incoming: Note[]) {
  const byId = new Map(current.map((note) => [note.id, note]))
  incoming.forEach((note) => byId.set(note.id, note))
  return sortNotes([...byId.values()])
}

export default function useNotes(userId: string | null, filters: NoteFilters) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [searchLimited, setSearchLimited] = useState(false)
  const [error, setError] = useState('')
  const requestVersion = useRef(0)
  const paginationController = useRef<AbortController | null>(null)

  useEffect(() => {
    requestVersion.current += 1
    paginationController.current?.abort()
    setNotes([])
    setNextCursor(null)
    setHasMore(false)
    setSearchLimited(false)
    setError('')

    if (!userId) {
      setLoading(false)
      setLoadingMore(false)
      return undefined
    }

    const version = requestVersion.current
    const controller = new AbortController()
    setLoading(true)
    notesApi.list({ ...filters, limit: PAGE_SIZE }, controller.signal)
      .then((response) => {
        if (version !== requestVersion.current) return
        setNotes(mergeNotes([], response.notes))
        setNextCursor(response.nextCursor ?? null)
        setHasMore(response.hasMore)
        setSearchLimited(response.searchLimited)
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return
        if (version === requestVersion.current) {
          setError(message(loadError, 'Failed to load notes.'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && version === requestVersion.current) setLoading(false)
      })

    return () => controller.abort()
  }, [userId, filters.q, filters.tag])

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || !nextCursor || loading || loadingMore) return
    paginationController.current?.abort()
    const controller = new AbortController()
    paginationController.current = controller
    const version = requestVersion.current
    setLoadingMore(true)
    setError('')
    try {
      const response = await notesApi.list(
        { ...filters, limit: PAGE_SIZE, cursor: nextCursor },
        controller.signal,
      )
      if (controller.signal.aborted || version !== requestVersion.current) return
      setNotes((current) => mergeNotes(current, response.notes))
      setNextCursor(response.nextCursor ?? null)
      setHasMore(response.hasMore)
      setSearchLimited((current) => current || response.searchLimited)
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      if (version === requestVersion.current) {
        setError(message(loadError, 'Failed to load more notes.'))
      }
    } finally {
      if (!controller.signal.aborted && version === requestVersion.current) setLoadingMore(false)
    }
  }, [filters, hasMore, loading, loadingMore, nextCursor, userId])

  const add = useCallback(async (input: NoteInput) => {
    setError('')
    try {
      const { note } = await notesApi.create(input)
      if (noteMatchesFilters(note, filters)) setNotes((current) => mergeNotes(current, [note]))
      return note
    } catch (saveError) {
      setError(message(saveError, 'Failed to save note.'))
      throw saveError
    }
  }, [filters])

  const update = useCallback(async (id: string, input: NoteInput) => {
    setError('')
    try {
      const { note } = await notesApi.update(id, input)
      setNotes((current) => {
        const withoutOld = current.filter((item) => item.id !== id)
        return noteMatchesFilters(note, filters) ? mergeNotes(withoutOld, [note]) : withoutOld
      })
      return note
    } catch (saveError) {
      setError(message(saveError, 'Failed to update note.'))
      throw saveError
    }
  }, [filters])

  const remove = useCallback(async (id: string) => {
    setError('')
    try {
      await notesApi.delete(id)
      setNotes((current) => current.filter((note) => note.id !== id))
    } catch (deleteError) {
      setError(message(deleteError, 'Failed to delete note.'))
      throw deleteError
    }
  }, [])

  return {
    notes,
    loading,
    loadingMore,
    hasMore,
    searchLimited,
    error,
    clearError: () => setError(''),
    loadMore,
    add,
    update,
    remove,
  }
}
