import React, { useState } from 'react'

export default function NoteForm({ onAdd, loading }) {
  const [text, setText] = useState('')

  return (
    <form
      className="note-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!text.trim()) return
        try {
          await onAdd(text)
          setText('')
        } catch {
          // Keep the draft in place when saving fails.
        }
      }}
    >
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Write a note..."
        rows="3"
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Adding...' : 'Add'}
      </button>
    </form>
  )
}
