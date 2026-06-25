import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function NoteList({ notes, onDelete }) {
  function formatTimestamp(note) {
    if (!note.createdAt) return ''
    return new Date(note.createdAt).toLocaleString()
  }

  if (!notes.length) {
    return <p className="muted-message">No notes yet.</p>
  }

  return (
    <ul className="note-list">
      {notes.map((note) => (
        <li key={note.id} className="note-item">
          <div className="note-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.text}</ReactMarkdown>
            {!!note.tags?.length && (
              <div className="tag-list" aria-label="Note tags">
                {note.tags.map((tag) => (
                  <span key={tag} className="tag-pill">{tag}</span>
                ))}
              </div>
            )}
            <time>{formatTimestamp(note)}</time>
          </div>
          <button className="btn-text" onClick={() => onDelete(note.id)}>
            Delete
          </button>
        </li>
      ))}
    </ul>
  )
}
