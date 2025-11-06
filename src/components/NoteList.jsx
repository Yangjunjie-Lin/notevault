// frontend/src/components/NoteList.jsx
import React from 'react'

export default function NoteList({ notes }) {
  // 格式化时间戳（兼容 serverTimestamp + localTime）
  function formatTimestamp(note) {
    const ts = note.createdAt
    if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleString()
    if (note.localTime) return new Date(note.localTime).toLocaleString()
    return ''
  }

  if (!notes.length) {
    return <p style={{ textAlign: 'center', color: '#777' }}>No notes yet.</p>
  }

  return (
    <ul style={{ marginTop: 16 }}>
      {notes.map((n) => (
        <li key={n.id} style={{ padding: 8, borderBottom: '1px solid #eee' }}>
          <div>{n.text}</div>
          <small style={{ color: '#666' }}>{formatTimestamp(n)}</small>
        </li>
      ))}
    </ul>
  )
}
