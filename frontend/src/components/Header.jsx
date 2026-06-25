export default function Header({ user, authReady, onSignIn, onSignOut }) {
  return (
    <header className="app-header">
      <h1>Personal Notebook</h1>
      {user ? (
        <div className="user-info">
          {user.photoURL && <img src={user.photoURL} alt="" />}
          <span>{user.displayName || user.email}</span>
          <button className="btn-secondary" onClick={onSignOut}>Log out</button>
        </div>
      ) : (
        <button className="btn-primary" onClick={onSignIn} disabled={!authReady}>Sign in</button>
      )}
    </header>
  )
}
