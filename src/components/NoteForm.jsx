import React, { useState } from 'react'

export default function NoteForm({ onAdd, loading }) {
  const [text, setText] = useState('')
  return (
    <form
      className="note-form"
      onSubmit={async e => {
        e.preventDefault()
        if (!text.trim()) return
        await onAdd(text)
        setText('')
      }}
    >
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Write a new note..."
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Adding...' : 'Add'}
      </button>
    </form>
  )
}
