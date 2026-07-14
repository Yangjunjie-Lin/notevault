import React, { useEffect, useRef } from 'react'

function AlertIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4 6h14M9 6V4h4v2M8 6v11a1 1 0 001 1h4a1 1 0 001-1V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type Props = {
  open: boolean
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
  title?: string
  description?: string
  confirmLabel?: string
  loadingLabel?: string
  cancelLabel?: string
  returnFocus?: HTMLElement | null
}

export default function ConfirmDialog({
  open,
  loading,
  onConfirm,
  onCancel,
  title = 'Delete this note?',
  description = 'This note will be permanently removed. There is no undo.',
  confirmLabel = 'Delete note',
  loadingLabel = 'Deleting…',
  cancelLabel = 'Cancel',
  returnFocus = null,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      previousFocus.current = returnFocus ?? document.activeElement as HTMLElement
      const id = setTimeout(() => cancelRef.current?.focus(), 30)
      return () => clearTimeout(id)
    }
    const focusTarget = previousFocus.current
    previousFocus.current = null
    const id = setTimeout(() => {
      if (focusTarget?.isConnected) focusTarget.focus()
    }, 0)
    return () => clearTimeout(id)
  }, [open, returnFocus])

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!loading) onCancel()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [loading, onCancel, open])

  if (!open) return null

  return (
    <div
      className="nv-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dlg-title"
      aria-describedby="confirm-dlg-desc"
      onClick={(event) => { if (event.target === event.currentTarget && !loading) onCancel() }}
    >
      <div className="nv-dialog" ref={dialogRef}>
        <div className="nv-dialog-icon" aria-hidden="true"><AlertIcon /></div>
        <h2 className="nv-dialog-title" id="confirm-dlg-title">{title}</h2>
        <p className="nv-dialog-desc" id="confirm-dlg-desc">{description}</p>
        <div className="nv-dialog-actions">
          <button ref={cancelRef} className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button className="btn btn-danger-solid" onClick={onConfirm} disabled={loading} aria-busy={loading}>
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
