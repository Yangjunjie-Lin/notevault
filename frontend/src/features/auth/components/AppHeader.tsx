import React from 'react'

// Vault brand SVG logo mark
function VaultLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.6"/>
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="7" y1="5" x2="7" y2="1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

type FirebaseUser = {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}

type Props = {
  user: FirebaseUser | null
  authReady: boolean
  authBusy: boolean
  onSignIn: () => void
  onSignOut: () => void
}

/**
 * Sticky top navigation bar.
 *
 * Renders the NoteVault brand mark, user avatar + display name when signed in,
 * and a sign-in or sign-out button. The sign-in button is disabled when
 * Firebase is misconfigured (authReady = false).
 */
export default function AppHeader({ user, authReady, authBusy, onSignIn, onSignOut }: Props) {
  const initials = user
    ? (user.displayName || user.email || '?').slice(0, 2).toUpperCase()
    : ''

  return (
    <header className="nv-header" role="banner">
      {/* Skip-link anchor target is defined on main content */}
      <a href="#main-content" className="nv-brand" aria-label="NoteVault – home">
        <div className="nv-brand-logo" aria-hidden="true">
          <VaultLogo />
        </div>
        <span className="nv-brand-name">NoteVault</span>
      </a>

      <nav className="nv-header-end" aria-label="Account navigation">
        {user ? (
          <div className="nv-user">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={`${user.displayName || user.email || 'User'} avatar`}
                className="nv-avatar"
                width={30}
                height={30}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="nv-avatar-initials" aria-hidden="true">
                {initials}
              </div>
            )}
            <span className="nv-user-name">
              {user.displayName || user.email}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={onSignOut}
              disabled={authBusy}
              aria-busy={authBusy}
              aria-label="Sign out"
            >
              {authBusy ? 'Signing out…' : 'Log out'}
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={onSignIn}
            disabled={!authReady || authBusy}
            aria-busy={authBusy}
            aria-disabled={!authReady}
          >
            {authBusy ? 'Signing in…' : 'Sign in'}
          </button>
        )}
      </nav>
    </header>
  )
}
