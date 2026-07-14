import React, { useEffect, useState } from 'react'

import type { Note, NoteInput } from '../types'
import SafeMarkdown from './SafeMarkdown'

const MAX_BODY = 5000
const MAX_TAGS = 10
const MAX_TAG_LEN = 32

export function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag) => tag.length <= MAX_TAG_LEN)
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
    .slice(0, MAX_TAGS)
}

function PenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function MarkdownBadge() {
  return (
    <svg width="16" height="10" viewBox="0 0 208 128" aria-hidden="true">
      <rect rx="15" ry="15" width="208" height="128" fill="none" stroke="currentColor" strokeWidth="12" />
      <path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z" fill="currentColor" />
    </svg>
  )
}

type Props = {
  editingNote: Note | null
  onSubmit: (note: NoteInput) => Promise<void>
  onCancelEditing: (trigger: HTMLButtonElement) => void
  onDirtyChange: (dirty: boolean) => void
  loading: boolean
}

export default function NoteComposer({
  editingNote,
  onSubmit,
  onCancelEditing,
  onDirtyChange,
  loading,
}: Props) {
  const [text, setText] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const tags = parseTags(tagInput)
  const initialText = editingNote?.text ?? ''
  const initialTags = editingNote?.tags ?? []
  const dirty = text !== initialText || JSON.stringify(tags) !== JSON.stringify(initialTags)
  const overLimit = text.length > MAX_BODY
  const charCountClass = overLimit
    ? 'nv-char-count nv-char-count--over'
    : text.length > MAX_BODY * 0.9
      ? 'nv-char-count nv-char-count--warn'
      : 'nv-char-count'

  useEffect(() => {
    setText(editingNote?.text ?? '')
    setTagInput(editingNote?.tags?.join(', ') ?? '')
    setMode('write')
  }, [editingNote?.id])

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!text.trim() || overLimit || loading) return
    try {
      await onSubmit({ text, tags })
      if (!editingNote) {
        setText('')
        setTagInput('')
        setMode('write')
      }
    } catch {
      // Preserve the draft; the workspace renders the API error.
    }
  }

  return (
    <section className="nv-panel nv-col-left" aria-label={editingNote ? 'Edit note composer' : 'New note composer'}>
      <div className="nv-panel-head">
        <span className="nv-panel-label">{editingNote ? 'Edit note' : 'New note'}</span>
      </div>

      <form className="nv-composer" onSubmit={handleSubmit} aria-label={editingNote ? 'Edit note' : 'Create a new note'} noValidate>
        <div className="nv-tabs" role="tablist" aria-label="Editor mode">
          <button type="button" role="tab" id="tab-write" aria-selected={mode === 'write'} aria-controls="panel-write" className={`nv-tab${mode === 'write' ? ' nv-tab--active' : ''}`} onClick={() => setMode('write')}>
            <PenIcon /> Write
          </button>
          <button type="button" role="tab" id="tab-preview" aria-selected={mode === 'preview'} aria-controls="panel-preview" className={`nv-tab${mode === 'preview' ? ' nv-tab--active' : ''}`} onClick={() => setMode('preview')}>
            <EyeIcon /> Preview
          </button>
        </div>

        {mode === 'write' ? (
          <div id="panel-write" role="tabpanel" aria-labelledby="tab-write">
            <label htmlFor="note-body" className="sr-only">Note body (Markdown)</label>
            <textarea
              id="note-body"
              className="nv-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Write your note in Markdown…"
              rows={7}
              aria-describedby="char-counter"
              aria-invalid={overLimit}
            />
            <div id="char-counter" className={charCountClass} aria-live="polite" aria-atomic="true">
              {text.length.toLocaleString()} / {MAX_BODY.toLocaleString()}
              {overLimit && ' — over limit'}
            </div>
          </div>
        ) : (
          <div id="panel-preview" role="tabpanel" aria-labelledby="tab-preview" className="nv-preview">
            {text.trim() ? (
              <div className="nv-md"><SafeMarkdown>{text}</SafeMarkdown></div>
            ) : (
              <p className="nv-preview-empty">Nothing to preview yet.</p>
            )}
          </div>
        )}

        <div className="nv-md-support"><MarkdownBadge /> Markdown formatting supported</div>

        <div className="nv-tag-section">
          <div className="nv-label-row">
            <label htmlFor="tag-input" className="nv-field-label">Tags</label>
            <span className="nv-field-hint" aria-live="polite" aria-atomic="true">{tags.length} / {MAX_TAGS}</span>
          </div>
          <input
            id="tag-input"
            className="nv-input"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="work, ideas, reading… (comma-separated)"
            aria-describedby="tag-hint"
            maxLength={MAX_TAGS * (MAX_TAG_LEN + 2)}
          />
          <span id="tag-hint" className="sr-only">
            Comma-separated tags. Max {MAX_TAGS} tags, each up to {MAX_TAG_LEN} characters. Tags are lowercased and deduplicated automatically.
          </span>
          {tags.length > 0 && (
            <div className="nv-tag-row" aria-label="Parsed tags preview" aria-live="polite">
              {tags.map((tag) => <span key={tag} className="nv-tag">{tag}</span>)}
            </div>
          )}
        </div>

        <div className="nv-composer-actions">
          {editingNote && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={(event) => onCancelEditing(event.currentTarget)}
              disabled={loading}
            >
              Cancel editing
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary nv-composer-submit"
            disabled={loading || !text.trim() || overLimit || Boolean(editingNote && !dirty)}
            aria-busy={loading}
          >
            {loading ? 'Saving…' : editingNote ? 'Save changes' : 'Add note'}
          </button>
        </div>
      </form>
    </section>
  )
}
