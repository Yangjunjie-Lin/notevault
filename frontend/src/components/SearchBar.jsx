import React, { useState } from 'react'

export default function SearchBar({ filters, onChange, loading }) {
  const [draft, setDraft] = useState(filters)

  function applyFilters(event) {
    event.preventDefault()
    onChange({
      q: draft.q.trim(),
      tag: draft.tag.trim().toLowerCase(),
    })
  }

  function clearFilters() {
    const nextFilters = { q: '', tag: '' }
    setDraft(nextFilters)
    onChange(nextFilters)
  }

  return (
    <form className="search-bar" onSubmit={applyFilters}>
      <input
        type="search"
        value={draft.q}
        onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
        placeholder="Search notes"
      />
      <input
        value={draft.tag}
        onChange={(event) => setDraft((current) => ({ ...current, tag: event.target.value }))}
        placeholder="Filter by tag"
      />
      <button type="submit" disabled={loading}>Search</button>
      <button type="button" className="btn-secondary" onClick={clearFilters} disabled={loading}>
        Clear
      </button>
    </form>
  )
}
