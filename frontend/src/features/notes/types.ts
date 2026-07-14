export type Note = {
  id: string
  text: string
  tags: string[]
  createdAt: number
}

export type NoteInput = Pick<Note, 'text' | 'tags'>

export type NoteFilters = {
  q: string
  tag: string
}

export const EMPTY_FILTERS: NoteFilters = { q: '', tag: '' }
