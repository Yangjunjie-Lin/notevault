import React, { useEffect, useRef } from 'react'

function TrashIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4 6h14M9 6V4h4v2M8 6v11a1 1 0 001 1h4a1 1 0 001-1V6"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

type Props = {
  open: boolean
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Accessible confirmation dialog before deleting a note.
 *
 * Behaviour:
 * - Focus moves to the Cancel button when opened, restores to the trigger on close.
 * - Pressing Escape cancels (unless delete is in progress).
 * - Tab/Shift-Tab cycle is trapped inside the dialog.
 * - Clicking the backdrop cancels.
 * - Both action buttons are disabled while `loading` is true.
 */
export default function ConfirmDialog({ open, loading, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  // Focus management: save / restore + initial focus
  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement
      // Slight defer lets the animation begin before shifting focus
      const id = setTimeout(() => cancelRef.current?.focus(), 30)
      return () => clearTimeout(id)
    } else {
      prevFocusRef.current?.focus()
      prevFocusRef.current = null
    }
  }, [open])

  // Keyboard: Escape + focus trap
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!loading) onCancel()
        return
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        )
        const first = focusable[0]
        const last  = focusable[focusable.length - 1]

        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div
      className="nv-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dlg-title"
      aria-describedby="confirm-dlg-desc"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel() }}
    >
      <div className="nv-dialog" ref={dialogRef}>
        <div className="nv-dialog-icon" aria-hidden="true">
          <TrashIcon />
        </div>

        <h2 className="nv-dialog-title" id="confirm-dlg-title">
          Delete this note?
        </h2>
        <p className="nv-dialog-desc" id="confirm-dlg-desc">
          This note will be permanently removed. There is no undo.
        </p>

        <div className="nv-dialog-actions">
          <button
            ref={cancelRef}
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger-solid"
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? 'Deleting…' : 'Delete note'}
          </button>
        </div>
      </div>
    </div>
  )
}
