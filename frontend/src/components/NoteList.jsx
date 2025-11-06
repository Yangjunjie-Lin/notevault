export default function NoteList({ notes }) {
  if (!notes.length) return <p className="empty">No notes yet.</p>
  return (
    <ul className="note-list">
      {notes.map(n => (
        <li key={n.id}>
          <p>{n.text}</p>
          <small>{new Date(n.createdAt).toLocaleString()}</small>
        </li>
      ))}
    </ul>
  )
}
