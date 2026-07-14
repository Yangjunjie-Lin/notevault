import React from 'react'

function NotesIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

type Props = {
  /** When true the user has active search/tag filters but no results matched */
  hasFilters: boolean
  onClearFilters: () => void
}

/**
 * Displayed instead of the notes list when there are no notes to show.
 * Differentiates between "you have no notes" and "no notes match the filters".
 */
export default function EmptyState({ hasFilters, onClearFilters }: Props) {
  return (
    <div className="nv-empty" role="status" aria-live="polite">
      <div className="nv-empty-icon">
        {hasFilters ? <SearchIcon /> : <NotesIcon />}
      </div>
      <p className="nv-empty-title">
        {hasFilters ? 'No matching notes' : 'No notes yet'}
      </p>
      <p className="nv-empty-desc">
        {hasFilters
          ? 'Try adjusting your search query or tag filter, then press Search.'
          : 'Write your first note using the editor — Markdown is fully supported.'}
      </p>
      {hasFilters && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClearFilters}>
          Clear filters
        </button>
      )}
    </div>
  )
}
