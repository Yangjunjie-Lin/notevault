import React from 'react'

function GoogleIcon() {
  return (
    <svg className="nv-google-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function CheckMini() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2 6.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

type Props = {
  authReady: boolean
  authBusy: boolean
  onSignIn: () => void
}

const FEATURES = [
  'Private to your Google account',
  'Markdown & GitHub Flavored Markdown',
  'Tag-based organisation',
  'Search your recent notes',
]

/**
 * Shown to unauthenticated users.
 * Displays brand, a value proposition, the Google sign-in button,
 * and a short list of privacy/feature assurances.
 */
export default function AuthLanding({ authReady, authBusy, onSignIn }: Props) {
  return (
    <main
      id="main-content"
      className="nv-landing"
      tabIndex={-1}
      aria-label="NoteVault welcome"
    >
      <div className="nv-landing-eyebrow" aria-hidden="true">
        ✦ NoteVault
      </div>

      <h1 className="nv-landing-h1">
        Your notes,{' '}
        <mark>beautifully private</mark>
      </h1>

      <p className="nv-landing-desc">
        A minimal, Markdown-first notebook. Write with tags, search instantly —
        and keep everything private to your Google account.
      </p>

      <button
        className="nv-google-btn"
        onClick={onSignIn}
        disabled={!authReady || authBusy}
        aria-busy={authBusy}
        aria-disabled={!authReady}
        aria-label="Sign in with Google to access NoteVault"
      >
        <GoogleIcon />
        {authBusy ? 'Opening Google…' : 'Continue with Google'}
      </button>

      <div className="nv-feature-row" role="list" aria-label="Key features">
        {FEATURES.map((feat) => (
          <span className="nv-feature-pill" key={feat} role="listitem">
            <CheckMini />
            {feat}
          </span>
        ))}
      </div>
    </main>
  )
}
