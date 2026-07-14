import React, { useEffect, useState } from 'react'

import type { NoteFilters } from '../types'

// ─── icons ────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function TagIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 2.5h6.5L14 8l-5.5 5.5H2V2.5z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <circle cx="5.5" cy="5.5" r="1" fill="currentColor"/>
    </svg>
  )
}

// ─── types ────────────────────────────────────────────────

type Props = {
  filters: NoteFilters
  onChange: (filters: NoteFilters) => void
  loading: boolean
}

// ─── component ────────────────────────────────────────────

/**
 * Search and tag-filter toolbar above the notes list.
 *
 * - Search input: full-text, max 100 chars, submitted on Enter or Search button
 * - Tag input: exact match, max 32 chars
 * - Clear button resets both fields and fires onChange immediately
 * - Active filter badges show what is currently applied
 * - Both inputs and buttons are disabled while `loading` is true
 */
export default function NotesToolbar({ filters, onChange, loading }: Props) {
  const [draft, setDraft] = useState<NoteFilters>(filters)

  // Sync local draft when parent clears filters externally (e.g. sign-out)
  useEffect(() => { setDraft(filters) }, [filters])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onChange({
      q: draft.q.slice(0, 100).trim(),
      tag: draft.tag.slice(0, 32).trim().toLowerCase(),
    })
  }

  function handleClear() {
    const empty: NoteFilters = { q: '', tag: '' }
    setDraft(empty)
    onChange(empty)
  }

  const hasActive = Boolean(filters.q || filters.tag)

  return (
    <form
      className="nv-toolbar"
      onSubmit={handleSubmit}
      role="search"
      aria-label="Search and filter notes"
    >
      {/* ── Inputs ── */}
      <div className="nv-toolbar-fields">
        {/* Full-text search */}
        <div className="nv-input-group">
          <span className="nv-input-icon"><SearchIcon /></span>
          <label htmlFor="search-q" className="sr-only">Search notes</label>
          <input
            id="search-q"
            type="search"
            className="nv-input"
            value={draft.q}
            onChange={(e) =>
              setDraft((d) => ({ ...d, q: e.target.value.slice(0, 100) }))
            }
            placeholder="Search notes"
            maxLength={100}
            disabled={loading}
          />
        </div>

        {/* Tag filter */}
        <div className="nv-input-group">
          <span className="nv-input-icon"><TagIcon /></span>
          <label htmlFor="filter-tag" className="sr-only">Filter by tag (exact match)</label>
          <input
            id="filter-tag"
            className="nv-input"
            value={draft.tag}
            onChange={(e) =>
              setDraft((d) => ({ ...d, tag: e.target.value.slice(0, 32) }))
            }
            placeholder="Filter by tag"
            maxLength={32}
            disabled={loading}
          />
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="nv-toolbar-actions">
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={loading || (!draft.q && !draft.tag && !filters.q && !filters.tag)}
        >
          Search
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={handleClear}
          disabled={loading || (!draft.q && !draft.tag && !filters.q && !filters.tag)}
        >
          Clear
        </button>
      </div>

      {/* ── Active filter badges ── */}
      {hasActive && (
        <div className="nv-active-filters" aria-live="polite" aria-label="Active filters">
          <span>Showing:</span>
          {filters.q && (
            <span className="nv-filter-badge">
              <SearchIcon />
              &ldquo;{filters.q}&rdquo;
            </span>
          )}
          {filters.tag && (
            <span className="nv-filter-badge">
              <TagIcon />
              {filters.tag}
            </span>
          )}
        </div>
      )}
    </form>
  )
}
