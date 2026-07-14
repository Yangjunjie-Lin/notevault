import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { Note } from '../types'

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 5h10M7 5V3h2v2M6 5v7a1 1 0 001 1h2a1 1 0 001-1V5"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

type Props = {
  note: Note
  onDelete: (id: string) => void
  onTagSelect: (tag: string) => void
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
export default function NoteCard({ note, onDelete, onTagSelect }: Props) {
  const isoDate = note.createdAt ? new Date(note.createdAt).toISOString() : ''

  return (
    <li className="nv-card" aria-label={`Note from ${formatTime(note.createdAt)}`}>
      {/* Markdown body */}
      <div className="nv-card-body">
        <div className="nv-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {note.text}
          </ReactMarkdown>
        </div>
      </div>

      {/* Footer: time, tags, delete */}
      <div className="nv-card-footer">
        <div className="nv-card-meta">
          {isoDate && (
            <time className="nv-card-time" dateTime={isoDate}>
              {formatTime(note.createdAt)}
            </time>
          )}
          {note.tags?.length > 0 && (
            <div className="nv-card-tags" aria-label="Tags">
              {note.tags.map((tag) => (
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

        <button
          className="btn-danger"
          onClick={() => onDelete(note.id)}
          aria-label={`Delete note from ${formatTime(note.createdAt)}`}
        >
          <TrashIcon />
          <span style={{ marginLeft: 4 }}>Delete</span>
        </button>
      </div>
    </li>
  )
}
