import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function NoteForm({ onAdd, loading }) {
  const [text, setText] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [mode, setMode] = useState('write')

  const tags = parseTags(tagInput)

  return (
    <form
      className="note-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!text.trim()) return
        try {
          await onAdd({ text, tags })
          setText('')
          setTagInput('')
          setMode('write')
        } catch {
          // Keep the draft in place when saving fails.
        }
      }}
    >
      <div className="note-editor">
        <div className="editor-toolbar" aria-label="Editor mode">
          <button
            type="button"
            className={mode === 'write' ? 'is-active' : ''}
            onClick={() => setMode('write')}
          >
            Write
          </button>
          <button
            type="button"
            className={mode === 'preview' ? 'is-active' : ''}
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
        </div>

        {mode === 'write' ? (
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Write a note with Markdown..."
            rows="6"
          />
        ) : (
          <div className="markdown-preview">
            {text.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            ) : (
              <p className="muted-message">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>

      <div className="note-form-footer">
        <input
          value={tagInput}
          onChange={(event) => setTagInput(event.target.value)}
          placeholder="Tags: work, ideas, reading"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Adding...' : 'Add note'}
        </button>
      </div>
    </form>
  )
}

function parseTags(value) {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
    .slice(0, 10)
}
