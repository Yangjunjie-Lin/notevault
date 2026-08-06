import { authFetch, buildApiUrl } from '../../shared/api/authFetch'
import type { Note, NoteInput, NotesQuery, NotesResponse } from './types'

export const notesApi = {
  list: (query: NotesQuery, signal?: AbortSignal) =>
    authFetch<NotesResponse>(buildApiUrl('/notes', query), { signal }),
  create: (input: NoteInput) =>
    authFetch<{ note: Note }>(buildApiUrl('/notes'), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, input: NoteInput) =>
    authFetch<{ note: Note }>(buildApiUrl(`/notes/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  delete: (id: string) =>
    authFetch<{ ok: boolean }>(buildApiUrl(`/notes/${encodeURIComponent(id)}`), {
      method: 'DELETE',
    }),
}
