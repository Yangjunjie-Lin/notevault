import React from 'react'

function AlertIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="16" height="16">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <circle cx="8" cy="11" r="0.9" fill="currentColor"/>
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

type Props = {
  message: string
  onDismiss: () => void
}

/**
 * Dismissible error notification strip.
 * Uses role="alert" + aria-live="assertive" so screen readers announce it immediately.
 */
export default function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div
      className="nv-error"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <AlertIcon />
      <span className="nv-error-msg">{message}</span>
      <button
        className="nv-error-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss error notification"
      >
        <XIcon />
      </button>
    </div>
  )
}

