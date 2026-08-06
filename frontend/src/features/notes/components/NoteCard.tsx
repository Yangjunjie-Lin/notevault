import React from 'react'

import type { Note } from '../types'
import SafeMarkdown from './SafeMarkdown'

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 5h10M7 5V3h2v2M6 5v7a1 1 0 001 1h2a1 1 0 001-1V5"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

type Props = {
  note: Note
  onEdit: (note: Note, trigger: HTMLButtonElement) => void
  onDelete: (id: string, trigger: HTMLButtonElement) => void
  onTagSelect: (tag: string) => void
  actionsDisabled?: boolean
}

function formatTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Single note card.
 *
 * Renders the note body as GitHub Flavored Markdown via react-markdown,
 * followed by tags and a localised creation time.
 * The delete button has low visual weight but expands to a 40 px touch target on mobile.
 *
 * Deletion is handled by the parent — this component only signals intent.
 */
export default function NoteCard({
  note,
  onEdit,
  onDelete,
  onTagSelect,
  actionsDisabled = false,
}: Props) {
  const isoDate = note.createdAt ? new Date(note.createdAt).toISOString() : ''
  const updatedIsoDate = note.updatedAt ? new Date(note.updatedAt).toISOString() : ''

  return (
    <li className="nv-card" aria-label={`Note from ${formatTime(note.createdAt)}`}>
      {/* Markdown body */}
      <div className="nv-card-body">
        <div className="nv-md">
          <SafeMarkdown>{note.text}</SafeMarkdown>
        </div>
      </div>

      {/* Footer: time, tags, delete */}
      <div className="nv-card-footer">
        <div className="nv-card-meta">
          {isoDate && (
            <time className="nv-card-time" dateTime={isoDate}>
              Created {formatTime(note.createdAt)}
            </time>
          )}
          {updatedIsoDate && (
            <time className="nv-card-time nv-card-time--updated" dateTime={updatedIsoDate}>
              Updated {formatTime(note.updatedAt ?? 0)}
            </time>
          )}
          {(note.tags?.length ?? 0) > 0 && (
            <div className="nv-card-tags" aria-label="Tags">
              {(note.tags ?? []).map((tag) => (
                <button
                  type="button"
                  key={tag}
                  className="nv-card-tag"
                  onClick={() => onTagSelect(tag)}
                  aria-label={`Filter notes by ${tag}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="nv-card-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={(event) => onEdit(note, event.currentTarget)}
            disabled={actionsDisabled}
            aria-label={`Edit note from ${formatTime(note.createdAt)}`}
          >
            <EditIcon /> Edit
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={(event) => onDelete(note.id, event.currentTarget)}
            disabled={actionsDisabled}
            aria-label={`Delete note from ${formatTime(note.createdAt)}`}
          >
            <TrashIcon /> Delete
          </button>
        </div>
      </div>
    </li>
  )
}
