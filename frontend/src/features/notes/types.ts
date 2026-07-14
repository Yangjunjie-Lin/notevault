import type { components } from './generated'

export type Note = components['schemas']['NoteOut']
export type NoteInput = components['schemas']['NoteCreate']
export type NotesResponse = components['schemas']['NotesResponse']

export type NoteFilters = {
  q: string
  tag: string
}

export type NotesQuery = NoteFilters & {
  limit?: number
  cursor?: string | null
}

export const EMPTY_FILTERS: NoteFilters = { q: '', tag: '' }
