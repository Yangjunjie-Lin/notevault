import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import SafeMarkdown from '../../notes/components/SafeMarkdown'
import type { Note } from '../../notes/types'
import ConfirmDialog from '../../../shared/components/ConfirmDialog'
import { checkpointsApi, conversationsApi } from '../api'
import type {
  CaptureItem,
  CaptureSuggestion,
  Checkpoint,
  ConversationDetail,
  ConversationMessage,
  ConversationSummary,
} from '../types'
import { createRequestId } from '../types'
import CaptureReviewDialog from './CaptureReviewDialog'
import CheckpointList from './CheckpointList'
import ConversationGraph from './ConversationGraph'

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function sortSummaries(items: ConversationSummary[]) {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id))
}

function formatRelative(value: number) {
  const delta = Date.now() - value
  if (delta < 60_000) return 'just now'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

function lastAssistant(detail: ConversationDetail | null) {
  return [...(detail?.messages ?? [])].reverse().find((message) => message.role === 'assistant') ?? null
}

function inlineSnippet(value: string) {
  return value.replace(/[#>*_`\[\]-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

type Props = {
  onNotesCaptured: (notes: Note[]) => void
  onBlockingChange?: (blocking: boolean) => void
}

export default function ConversationWorkspace({ onNotesCaptured, onBlockingChange }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [draft, setDraft] = useState('')
  const [zoom, setZoom] = useState(0.9)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [captureLoading, setCaptureLoading] = useState(false)
  const [captureSaving, setCaptureSaving] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [suggestions, setSuggestions] = useState<CaptureSuggestion[]>([])
  const [checkpointUpdating, setCheckpointUpdating] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const composerContainerRef = useRef<HTMLFormElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)

  const mutating = sending || captureLoading || captureSaving || deleting
  const busy = loading || mutating
  const selected = useMemo(
    () => detail?.messages.find((message) => message.id === selectedId) ?? null,
    [detail, selectedId],
  )

  useEffect(() => onBlockingChange?.(mutating), [mutating, onBlockingChange])

  useLayoutEffect(() => {
    const center = centerRef.current
    const composer = composerContainerRef.current
    if (!center || !composer) return undefined
    const centerElement = center
    const composerElement = composer

    function updateInset() {
      const centerRect = centerElement.getBoundingClientRect()
      const composerRect = composerElement.getBoundingClientRect()
      if (composerRect.height <= 0) return
      const bottomGap = Math.max(0, centerRect.bottom - composerRect.bottom)
      centerElement.style.setProperty(
        '--nv-canvas-composer-inset',
        `${Math.ceil(composerRect.height + bottomGap + 12)}px`,
      )
    }

    updateInset()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(updateInset)
    observer.observe(composerElement)
    observer.observe(centerElement)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    Promise.all([
      conversationsApi.list(controller.signal),
      checkpointsApi.list(controller.signal),
    ]).then(async ([conversationResponse, checkpointResponse]) => {
      if (controller.signal.aborted) return
      const next = sortSummaries(conversationResponse.conversations)
      setConversations(next)
      setCheckpoints(checkpointResponse.checkpoints)
      if (next[0]) {
        const loaded = await conversationsApi.get(next[0].id, controller.signal)
        if (controller.signal.aborted) return
        setActiveId(loaded.id)
        setDetail(loaded)
        setSelectedId(lastAssistant(loaded)?.id ?? loaded.messages.at(-1)?.id ?? null)
      }
    }).catch((loadError: unknown) => {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      setError(errorMessage(loadError, 'Failed to load the conversation workspace.'))
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!status) return undefined
    const id = window.setTimeout(() => setStatus(''), 5000)
    return () => window.clearTimeout(id)
  }, [status])

  function upsertDetail(next: ConversationDetail) {
    setDetail(next)
    setActiveId(next.id)
    setConversations((current) => sortSummaries([
      ...current.filter((item) => item.id !== next.id),
      {
        id: next.id,
        title: next.title,
        createdAt: next.createdAt,
        updatedAt: next.updatedAt,
        messageCount: next.messageCount,
      },
    ]))
    const assistant = lastAssistant(next)
    setSelectedId(assistant?.id ?? next.messages.at(-1)?.id ?? null)
  }

  async function loadConversation(id: string) {
    if (busy || id === activeId) return
    setLoading(true)
    setError('')
    try {
      const loaded = await conversationsApi.get(id)
      setZoom(0.9)
      upsertDetail(loaded)
    } catch (loadError) {
      setError(errorMessage(loadError, 'Failed to load this conversation.'))
    } finally {
      setLoading(false)
    }
  }

  function newConversation() {
    if (busy) return
    setActiveId(null)
    setDetail(null)
    setSelectedId(null)
    setDraft('')
    setZoom(0.9)
    setError('')
    setStatus('New conversation ready. Your first message is not sent until you choose Start.')
    window.setTimeout(() => composerRef.current?.focus(), 0)
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    const anchor = selected ?? lastAssistant(detail)
    if (detail && !anchor) return
    setSending(true)
    setError('')
    setStatus(detail ? 'Generating a new branch…' : 'Starting your conversation…')
    const controller = new AbortController()
    try {
      const requestId = createRequestId()
      const next = detail && anchor
        ? await conversationsApi.reply(detail.id, anchor.id, text, requestId, controller.signal)
        : await conversationsApi.start(text, requestId, controller.signal)
      setDraft('')
      upsertDetail(next)
      setStatus(detail ? 'Branch added. Select any earlier message to branch again.' : 'Conversation created.')
    } catch (sendError) {
      setError(errorMessage(sendError, 'AI could not complete this turn. Your message is still here.'))
    } finally {
      setSending(false)
    }
  }

  function selectMessage(message: ConversationMessage) {
    setSelectedId(message.id)
    setStatus(`Selected ${message.role === 'assistant' ? 'AI' : 'your'} message as the branch point.`)
  }

  function focusComposer() {
    composerRef.current?.focus()
  }

  async function prepareCapture(intent: 'both' | 'notes' | 'checkpoints' = 'both') {
    if (!detail || !selected || busy) return
    setCaptureLoading(true)
    setError('')
    setStatus('AI is preparing reviewable candidates. Nothing will be saved automatically.')
    try {
      const response = await conversationsApi.suggest(detail.id, selected.id, intent)
      setSuggestions(response.suggestions ?? [])
      setCaptureOpen(true)
      setStatus('Review each candidate and select only what belongs in NoteVault.')
    } catch (captureError) {
      setError(errorMessage(captureError, 'Could not prepare capture candidates.'))
    } finally {
      setCaptureLoading(false)
    }
  }

  async function saveCapture(items: CaptureItem[]) {
    if (!detail || !selected || items.length === 0 || captureSaving) return
    setCaptureSaving(true)
    setError('')
    try {
      const result = await conversationsApi.capture(
        detail.id,
        selected.id,
        createRequestId(),
        items,
      )
      const capturedNotes = result.notes ?? []
      const capturedCheckpoints = result.checkpoints ?? []
      if (capturedNotes.length) onNotesCaptured(capturedNotes)
      if (capturedCheckpoints.length) {
        setCheckpoints((current) => [
          ...capturedCheckpoints,
          ...current.filter((item) => !capturedCheckpoints.some((next) => next.id === item.id)),
        ])
      }
      setCaptureOpen(false)
      setStatus(`Saved ${capturedNotes.length} notes and ${capturedCheckpoints.length} checkpoints.`)
    } catch (captureError) {
      setError(errorMessage(captureError, 'The selected items were not saved. Please try again.'))
    } finally {
      setCaptureSaving(false)
    }
  }

  async function toggleCheckpoint(checkpoint: Checkpoint) {
    if (checkpointUpdating) return
    setCheckpointUpdating(checkpoint.id)
    setError('')
    try {
      const response = await checkpointsApi.update(checkpoint.id, !checkpoint.completed)
      setCheckpoints((current) => current.map(
        (item) => item.id === checkpoint.id ? response.checkpoint : item,
      ))
      setStatus(response.checkpoint.completed ? 'Checkpoint completed.' : 'Checkpoint reopened.')
    } catch (checkpointError) {
      setError(errorMessage(checkpointError, 'Could not update this checkpoint.'))
    } finally {
      setCheckpointUpdating(null)
    }
  }

  async function deleteConversation() {
    if (!detail || deleting) return
    setDeleting(true)
    setError('')
    try {
      await conversationsApi.remove(detail.id)
      setConversations((current) => current.filter((item) => item.id !== detail.id))
      setActiveId(null)
      setDetail(null)
      setSelectedId(null)
      setDraft('')
      setDeleteOpen(false)
      setStatus('Conversation deleted. Previously confirmed notes and checkpoints were kept.')
    } catch (deleteError) {
      setError(errorMessage(deleteError, 'Could not delete this conversation.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main id="main-content" className="nv-conversation-workspace" tabIndex={-1} aria-label="AI conversation canvas">
      {error && (
        <div className="nv-canvas-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}
      {status && <div className="sr-only" role="status">{status}</div>}

      <aside className="nv-conversation-library" aria-label="Conversation library">
        <div className="nv-library-head">
          <div>
            <span className="nv-canvas-kicker">Private workspace</span>
            <h1>Conversations</h1>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={newConversation} disabled={busy}>
            + New
          </button>
        </div>
        <p className="nv-library-intro">Explore an idea, then branch from any message without losing the original path.</p>
        <div className="nv-conversation-list" role="list">
          {conversations.length === 0 ? (
            <div className="nv-library-empty" role="listitem">
              <span aria-hidden="true">◇</span>
              <strong>No conversations yet</strong>
              <small>Your first message creates a private visual map.</small>
            </div>
          ) : conversations.map((conversation) => (
            <div role="listitem" key={conversation.id}>
              <button
                type="button"
                className={`nv-conversation-row${activeId === conversation.id ? ' nv-conversation-row--active' : ''}`}
                onClick={() => void loadConversation(conversation.id)}
                disabled={busy}
                aria-current={activeId === conversation.id ? 'page' : undefined}
              >
                <span>{conversation.title}</span>
                <small>{conversation.messageCount} messages · {formatRelative(conversation.updatedAt)}</small>
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className="nv-conversation-center" ref={centerRef}>
        {loading ? (
          <div className="nv-canvas-loading" aria-busy="true">
            <span className="nv-spinner" aria-hidden="true" />
            Loading your conversation map…
          </div>
        ) : detail ? (
          <ConversationGraph
            key={detail.id}
            messages={detail.messages}
            selectedId={selectedId}
            zoom={zoom}
            onZoomChange={setZoom}
            onSelect={selectMessage}
          />
        ) : (
          <section className="nv-canvas-welcome" aria-labelledby="canvas-welcome-title">
            <div className="nv-welcome-visual" aria-hidden="true">
              <span className="nv-demo-node nv-demo-node--user">Your idea</span>
              <span className="nv-demo-line" />
              <span className="nv-demo-node nv-demo-node--ai">AI response</span>
              <span className="nv-demo-line nv-demo-line--branch" />
              <span className="nv-demo-node nv-demo-node--branch">New branch</span>
            </div>
            <span className="nv-canvas-kicker">Think in branches</span>
            <h2 id="canvas-welcome-title">Turn a conversation into a map you can act on.</h2>
            <p>Ask a question, compare directions, then capture only the notes and checkpoints you approve.</p>
            <ul>
              <li>Reply from any earlier message</li>
              <li>Keep every branch connected and visible</li>
              <li>Review AI suggestions before saving</li>
            </ul>
          </section>
        )}

        <form className="nv-canvas-composer" ref={composerContainerRef} onSubmit={sendMessage}>
          <div className="nv-composer-context">
            <span className="nv-canvas-kicker">{detail ? 'Branch from' : 'New conversation'}</span>
            <strong>{selected ? `${selected.role === 'assistant' ? 'AI' : 'You'} · ${inlineSnippet(selected.content).slice(0, 72)}` : 'Start a fresh map'}</strong>
          </div>
          <div className="nv-canvas-compose-row">
            <textarea
              ref={composerRef}
              className="nv-textarea"
              aria-label={detail ? 'Reply to selected message' : 'Start a conversation'}
              placeholder={detail ? 'Continue this branch…' : 'What do you want to explore?'}
              value={draft}
              maxLength={5000}
              rows={2}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <button
              type="submit"
              className="btn btn-primary nv-canvas-send"
              disabled={!draft.trim() || busy}
              aria-busy={sending}
            >
              {sending ? 'Thinking…' : detail ? 'Add branch' : 'Start'}
            </button>
          </div>
          <small>Ctrl/⌘ + Enter to send · AI replies are saved to this private map</small>
        </form>
      </div>

      <aside className="nv-conversation-inspector" aria-label="Selected message and checkpoints">
        <section className="nv-message-inspector" aria-labelledby="message-inspector-heading">
          <div className="nv-inspector-heading">
            <div>
              <span className="nv-canvas-kicker">Selected node</span>
              <h2 id="message-inspector-heading">Message</h2>
            </div>
            <div className="nv-inspector-heading-actions">
              {selected && <span className={`nv-role-badge nv-role-badge--${selected.role}`}>{selected.role === 'assistant' ? 'AI' : 'You'}</span>}
              {detail && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm nv-delete-map"
                  onClick={() => setDeleteOpen(true)}
                  disabled={busy}
                >
                  Delete map
                </button>
              )}
            </div>
          </div>
          {selected ? (
            <>
              <div className="nv-inspector-markdown nv-md">
                <SafeMarkdown>{selected.content}</SafeMarkdown>
              </div>
              <div className="nv-inspector-actions">
                <button type="button" className="btn btn-secondary" onClick={focusComposer} disabled={busy}>
                  Reply from here
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void prepareCapture('both')}
                  disabled={busy}
                  aria-busy={captureLoading}
                >
                  {captureLoading ? 'Preparing…' : 'Capture ideas'}
                </button>
              </div>
              <p className="nv-capture-hint">Capture sends this node’s branch to AI. You review every candidate before saving.</p>
            </>
          ) : (
            <p className="nv-inspector-empty">Select a node to read it, branch from it, or prepare capture candidates.</p>
          )}
        </section>
        <CheckpointList
          checkpoints={checkpoints}
          updatingId={checkpointUpdating}
          onToggle={(checkpoint) => void toggleCheckpoint(checkpoint)}
        />
      </aside>

      <CaptureReviewDialog
        open={captureOpen}
        suggestions={suggestions}
        loading={captureSaving}
        onCancel={() => { if (!captureSaving) setCaptureOpen(false) }}
        onSave={(items) => void saveCapture(items)}
      />
      <ConfirmDialog
        open={deleteOpen}
        loading={deleting}
        onCancel={() => { if (!deleting) setDeleteOpen(false) }}
        onConfirm={() => void deleteConversation()}
        title="Delete this conversation map?"
        description="The conversation and its branches will be permanently removed. Notes and checkpoints you already confirmed will be kept."
        confirmLabel="Delete map"
        loadingLabel="Deleting map…"
      />
    </main>
  )
}
