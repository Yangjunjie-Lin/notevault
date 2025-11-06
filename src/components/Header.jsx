export default function Header({ user, onSignIn, onSignOut }) {
  return (
    <header className="app-header">
      <h1>🧠 GreatUniHack Notes</h1>
      {user ? (
        <div className="user-info">
          <img src={user.photoURL} alt="avatar" />
          <span>{user.displayName}</span>
          <button onClick={onSignOut}>Log out</button>
        </div>
      ) : (
        <button className="btn-primary" onClick={onSignIn}>Sign in</button>
      )}
    </header>
  )
}
