import React, { useEffect, useId, useRef, type ReactNode } from 'react'

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
  accessibleDescription?: string
  confirmLabel?: string
  loadingLabel?: string
  cancelLabel?: string
  returnFocus?: HTMLElement | null
  fallbackFocus?: HTMLElement | null
  children?: ReactNode
  secondaryLabel?: string
  onSecondary?: () => void
  icon?: ReactNode
  tone?: 'danger' | 'ai'
  confirmVariant?: 'danger' | 'primary'
  confirmDisabled?: boolean
  wide?: boolean
}

export default function ConfirmDialog({
  open,
  loading,
  onConfirm,
  onCancel,
  title = 'Delete this note?',
  description = 'This note will be permanently removed. There is no undo.',
  accessibleDescription,
  confirmLabel = 'Delete note',
  loadingLabel = 'Deleting…',
  cancelLabel = 'Cancel',
  returnFocus = null,
  fallbackFocus = null,
  children,
  secondaryLabel,
  onSecondary,
  icon,
  tone = 'danger',
  confirmVariant = 'danger',
  confirmDisabled = false,
  wide = false,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (open) {
      previousFocus.current = returnFocus ?? document.activeElement as HTMLElement
      const id = setTimeout(() => cancelRef.current?.focus(), 30)
      return () => clearTimeout(id)
    }
    const focusTarget = previousFocus.current
    previousFocus.current = null
    const id = setTimeout(() => {
      if (focusTarget?.isConnected && !focusTarget.matches(':disabled')) {
        focusTarget.focus()
      } else if (fallbackFocus?.isConnected && !fallbackFocus.matches(':disabled')) {
        fallbackFocus.focus()
      }
    }, 0)
    return () => clearTimeout(id)
  }, [fallbackFocus, open, returnFocus])

  useEffect(() => {
    if (!open || !loading) return undefined
    const id = setTimeout(() => {
      const dialog = dialogRef.current
      const active = document.activeElement as HTMLElement | null
      if (dialog && (!active || !dialog.contains(active) || active.matches(':disabled'))) {
        dialog.focus()
      }
    }, 0)
    return () => clearTimeout(id)
  }, [loading, open])

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
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      if (
        document.activeElement === dialogRef.current
        || !dialogRef.current.contains(document.activeElement)
      ) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
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
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={loading}
      onClick={(event) => { if (event.target === event.currentTarget && !loading) onCancel() }}
    >
      <div
        className={`nv-dialog${wide ? ' nv-dialog--wide' : ''}`}
        ref={dialogRef}
        tabIndex={-1}
        aria-busy={loading}
      >
        <div className={`nv-dialog-icon${tone === 'ai' ? ' nv-dialog-icon--ai' : ''}`} aria-hidden="true">
          {icon ?? <AlertIcon />}
        </div>
        <h2 className="nv-dialog-title" id={titleId}>{title}</h2>
        {children ? (
          <>
            <p className="sr-only" id={descriptionId}>
              {accessibleDescription ?? description}
            </p>
            <div className="nv-dialog-desc">{children}</div>
          </>
        ) : (
          <p className="nv-dialog-desc" id={descriptionId}>
            {accessibleDescription ?? description}
          </p>
        )}
        <div className="nv-dialog-actions">
          <button type="button" ref={cancelRef} className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button type="button" className="btn btn-secondary" onClick={onSecondary} disabled={loading}>
              {secondaryLabel}
            </button>
          )}
          <button
            type="button"
            className={`btn ${confirmVariant === 'primary' ? 'btn-primary' : 'btn-danger-solid'}`}
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
            aria-busy={loading}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
