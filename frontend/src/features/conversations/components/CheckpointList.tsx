import type { Checkpoint } from '../types'

type Props = {
  checkpoints: Checkpoint[]
  updatingId: string | null
  onToggle: (checkpoint: Checkpoint) => void
}

export default function CheckpointList({ checkpoints, updatingId, onToggle }: Props) {
  const open = checkpoints.filter((item) => !item.completed)
  const done = checkpoints.filter((item) => item.completed)

  return (
    <section className="nv-checkpoints" aria-labelledby="checkpoint-heading">
      <div className="nv-inspector-heading">
        <div>
          <span className="nv-canvas-kicker">Captured actions</span>
          <h2 id="checkpoint-heading">Checkpoints</h2>
        </div>
        <span className="nv-checkpoint-count">{open.length} open</span>
      </div>
      {checkpoints.length === 0 ? (
        <p className="nv-inspector-empty">Confirmed action items will appear here.</p>
      ) : (
        <ul className="nv-checkpoint-list">
          {[...open, ...done].map((checkpoint) => (
            <li key={checkpoint.id} className={checkpoint.completed ? 'nv-checkpoint--done' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={checkpoint.completed}
                  disabled={updatingId === checkpoint.id}
                  onChange={() => onToggle(checkpoint)}
                />
                <span>
                  <strong>{checkpoint.title}</strong>
                  <small>{checkpoint.details}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
