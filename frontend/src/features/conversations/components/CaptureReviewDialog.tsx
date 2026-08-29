import { useEffect, useMemo, useState } from 'react'

import ConfirmDialog from '../../../shared/components/ConfirmDialog'
import type { CaptureItem, CaptureSuggestion } from '../types'

type DraftSuggestion = CaptureSuggestion & { selected: boolean }

function CaptureIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 2.5l1.2 4.2L16.5 8l-4.3 1.3L11 13.5 9.8 9.3 5.5 8l4.3-1.3L11 2.5zM17 13l.7 2.3L20 16l-2.3.7L17 19l-.7-2.3L14 16l2.3-.7L17 13z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

type Props = {
  open: boolean
  suggestions: CaptureSuggestion[]
  loading: boolean
  onCancel: () => void
  onSave: (items: CaptureItem[]) => void
}

export default function CaptureReviewDialog({
  open,
  suggestions,
  loading,
  onCancel,
  onSave,
}: Props) {
  const [drafts, setDrafts] = useState<DraftSuggestion[]>([])

  useEffect(() => {
    if (open) setDrafts(suggestions.map((suggestion) => ({ ...suggestion, selected: false })))
  }, [open, suggestions])

  const selected = useMemo(() => drafts.filter((item) => item.selected), [drafts])

  function update(id: string, changes: Partial<DraftSuggestion>) {
    setDrafts((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  const completeItems = selected.filter((item) => item.title.trim() && item.content.trim())

  return (
    <ConfirmDialog
      open={open}
      loading={loading}
      onCancel={onCancel}
      onConfirm={() => onSave(completeItems.map(({ kind, title, content }) => ({
        kind,
        title: title.trim(),
        content: content.trim(),
      })))}
      title="Review capture candidates"
      description="Select and edit each item before anything is saved. Nothing is selected by default."
      accessibleDescription="Review AI-generated note and checkpoint candidates. Select one or more items to save."
      cancelLabel="Keep reviewing later"
      confirmLabel={`Save selected (${completeItems.length})`}
      loadingLabel="Saving selected…"
      confirmVariant="primary"
      confirmDisabled={completeItems.length === 0 || selected.length !== completeItems.length}
      tone="ai"
      icon={<CaptureIcon />}
      wide
    >
      <div className="nv-capture-review">
        <p className="nv-capture-disclosure">
          AI suggestions are drafts. Only checked items are written to your private NoteVault workspace.
        </p>
        {drafts.length === 0 ? (
          <p className="nv-capture-empty">No useful notes or checkpoints were found in this branch.</p>
        ) : drafts.map((item, index) => (
          <fieldset className={`nv-capture-card${item.selected ? ' nv-capture-card--selected' : ''}`} key={item.id}>
            <legend className="sr-only">Candidate {index + 1}</legend>
            <label className="nv-capture-select">
              <input
                type="checkbox"
                checked={item.selected}
                onChange={(event) => update(item.id, { selected: event.target.checked })}
              />
              <span>Include candidate {index + 1}</span>
            </label>
            <div className="nv-capture-fields">
              <label>
                <span>Save as</span>
                <select
                  className="nv-input"
                  value={item.kind}
                  onChange={(event) => update(item.id, {
                    kind: event.target.value as CaptureSuggestion['kind'],
                  })}
                  disabled={!item.selected || loading}
                >
                  <option value="note">Note</option>
                  <option value="checkpoint">Checkpoint</option>
                </select>
              </label>
              <label className="nv-capture-title-field">
                <span>Title</span>
                <input
                  className="nv-input"
                  value={item.title}
                  maxLength={120}
                  onChange={(event) => update(item.id, { title: event.target.value })}
                  disabled={!item.selected || loading}
                />
              </label>
            </div>
            <label>
              <span>Content</span>
              <textarea
                className="nv-textarea nv-capture-content"
                value={item.content}
                maxLength={2000}
                onChange={(event) => update(item.id, { content: event.target.value })}
                disabled={!item.selected || loading}
              />
            </label>
          </fieldset>
        ))}
        {selected.length > completeItems.length && (
          <p className="nv-capture-validation" role="alert">
            Every selected item needs both a title and content.
          </p>
        )}
      </div>
    </ConfirmDialog>
  )
}
