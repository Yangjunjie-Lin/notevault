import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { NoteInput } from '../types'

const MAX_BODY = 5000
const MAX_TAGS = 10
const MAX_TAG_LEN = 32

// ─── helpers ──────────────────────────────────────────────

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .filter((t) => t.length <= MAX_TAG_LEN)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, MAX_TAGS)
}

// ─── icons ────────────────────────────────────────────────

function PenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M11 2l3 3-8 8H3v-3l8-8z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}

function MarkdownBadge() {
  return (
    <svg width="16" height="10" viewBox="0 0 208 128" aria-hidden="true">
      <rect rx="15" ry="15" width="208" height="128" fill="none" stroke="currentColor" strokeWidth="12"/>
      <path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z"
        fill="currentColor"/>
    </svg>
  )
}

// ─── types ────────────────────────────────────────────────

type Props = {
  onAdd: (note: NoteInput) => Promise<void>
  loading: boolean
}

// ─── component ────────────────────────────────────────────

/**
 * Left-panel note editor.
 *
 * - Write / Preview tabs (role=tablist)
 * - Textarea capped at 5000 characters, with live char counter
 * - Tag input: comma-separated, trimmed, lowercased, deduped, max 10, each ≤ 32 chars
 * - On submit: calls onAdd({text, tags}); clears on success, keeps draft on failure
 * - Add note button disabled while saving or body is empty / over limit
 */
export default function NoteComposer({ onAdd, loading }: Props) {
  const [text, setText] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [mode, setMode] = useState<'write' | 'preview'>('write')

  const tags = parseTags(tagInput)
  const charCount = text.length
  const overLimit = charCount > MAX_BODY
  const charCountClass =
    overLimit
      ? 'nv-char-count nv-char-count--over'
      : charCount > MAX_BODY * 0.9
      ? 'nv-char-count nv-char-count--warn'
      : 'nv-char-count'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || overLimit || loading) return
    try {
      await onAdd({ text, tags })
      // Success — clear form
      setText('')
      setTagInput('')
      setMode('write')
    } catch {
      // Failure — keep draft in place (onAdd propagates error to parent)
    }
  }

  return (
    <section className="nv-panel nv-col-left" aria-label="New note composer">
      <div className="nv-panel-head">
        <span className="nv-panel-label" aria-hidden="true">New note</span>
      </div>

      <form
        className="nv-composer"
        onSubmit={handleSubmit}
        aria-label="Create a new note"
        noValidate
      >
        {/* ── Write / Preview tabs ── */}
        <div className="nv-tabs" role="tablist" aria-label="Editor mode">
          <button
            type="button"
            role="tab"
            id="tab-write"
            aria-selected={mode === 'write'}
            aria-controls="panel-write"
            className={`nv-tab${mode === 'write' ? ' nv-tab--active' : ''}`}
            onClick={() => setMode('write')}
          >
            <PenIcon /> Write
          </button>
          <button
            type="button"
            role="tab"
            id="tab-preview"
            aria-selected={mode === 'preview'}
            aria-controls="panel-preview"
            className={`nv-tab${mode === 'preview' ? ' nv-tab--active' : ''}`}
            onClick={() => setMode('preview')}
          >
            <EyeIcon /> Preview
          </button>
        </div>

        {/* ── Editor / Preview panel ── */}
        {mode === 'write' ? (
          <div
            id="panel-write"
            role="tabpanel"
            aria-labelledby="tab-write"
          >
            <label htmlFor="note-body" className="sr-only">Note body (Markdown)</label>
            <textarea
              id="note-body"
              className="nv-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write your note in Markdown…"
              rows={7}
              aria-describedby="char-counter"
              aria-invalid={overLimit}
            />
            <div
              id="char-counter"
              className={charCountClass}
              aria-live="polite"
              aria-atomic="true"
            >
              {charCount.toLocaleString()} / {MAX_BODY.toLocaleString()}
              {overLimit && ' — over limit'}
            </div>
          </div>
        ) : (
          <div
            id="panel-preview"
            role="tabpanel"
            aria-labelledby="tab-preview"
            className="nv-preview"
          >
            {text.trim() ? (
              <div className="nv-md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
              </div>
            ) : (
              <p className="nv-preview-empty">Nothing to preview yet.</p>
            )}
          </div>
        )}

        <div className="nv-md-support">
          <MarkdownBadge />
          Markdown formatting supported
        </div>

        {/* ── Tags ── */}
        <div className="nv-tag-section">
          <div className="nv-label-row">
            <label htmlFor="tag-input" className="nv-field-label">Tags</label>
            <span
              className="nv-field-hint"
              aria-live="polite"
              aria-atomic="true"
            >
              {tags.length} / {MAX_TAGS}
            </span>
          </div>
          <input
            id="tag-input"
            className="nv-input"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="work, ideas, reading… (comma-separated)"
            aria-describedby="tag-hint"
            maxLength={MAX_TAGS * (MAX_TAG_LEN + 2)}
          />
          <span id="tag-hint" className="sr-only">
            Comma-separated tags. Max {MAX_TAGS} tags, each up to {MAX_TAG_LEN} characters.
            Tags are lowercased and deduplicated automatically.
          </span>

          {tags.length > 0 && (
            <div className="nv-tag-row" aria-label="Parsed tags preview" aria-live="polite">
              {tags.map((t) => (
                <span key={t} className="nv-tag">{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* ── Submit ── */}
        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={loading || !text.trim() || overLimit}
          aria-busy={loading}
          style={{ minHeight: 42 }}
        >
          {loading ? 'Saving…' : 'Add note'}
        </button>
      </form>
    </section>
  )
}
