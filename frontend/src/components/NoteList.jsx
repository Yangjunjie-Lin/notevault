import React from 'react'

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
          <div>
            <p>{note.text}</p>
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

