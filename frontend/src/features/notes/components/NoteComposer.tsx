import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import AiAssistPanel, { SparklesIcon } from '../../ai/components/AiAssistPanel'
import AiDisclosure from '../../ai/components/AiDisclosure'
import AiFormatReviewDialog from '../../ai/components/AiFormatReviewDialog'
import { MAX_NOTE_TEXT } from '../../ai/constants'
import useAiEditor from '../../ai/hooks/useAiEditor'
import useAiFormatter from '../../ai/hooks/useAiFormatter'
import type { Note, NoteInput } from '../types'
import SafeMarkdown from './SafeMarkdown'

const MAX_TAGS = 10
const MAX_TAG_LEN = 32

export function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag) => tag.length <= MAX_TAG_LEN)
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
    .slice(0, MAX_TAGS)
}

function PenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function MarkdownBadge() {
  return (
    <svg width="16" height="10" viewBox="0 0 208 128" aria-hidden="true">
      <rect rx="15" ry="15" width="208" height="128" fill="none" stroke="currentColor" strokeWidth="12" />
      <path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z" fill="currentColor" />
    </svg>
  )
}

type Props = {
  editingNote: Note | null
  onSubmit: (note: NoteInput) => Promise<void>
  onCancelEditing: (trigger: HTMLButtonElement) => void
  onDirtyChange: (dirty: boolean) => void
  onBlockingChange?: (blocking: boolean) => void
  loading: boolean
}

export default function NoteComposer({
  editingNote,
  onSubmit,
  onCancelEditing,
  onDirtyChange,
  onBlockingChange,
  loading,
}: Props) {
  const [text, setText] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const aiTriggerRef = useRef<HTMLButtonElement>(null)
  const submitTriggerRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const tags = parseTags(tagInput)
  const initialText = editingNote?.text ?? ''
  const initialTags = editingNote?.tags ?? []
  const dirty = text !== initialText || JSON.stringify(tags) !== JSON.stringify(initialTags)
  const overLimit = text.length > MAX_NOTE_TEXT
  const charCountClass = overLimit
    ? 'nv-char-count nv-char-count--over'
    : text.length > MAX_NOTE_TEXT * 0.9
      ? 'nv-char-count nv-char-count--warn'
      : 'nv-char-count'
  const sessionKey = editingNote?.id ?? 'new-note'

  const applyRevision = useCallback((revision: string) => {
    setText(revision)
    setMode('write')
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }, [])

  const aiEditor = useAiEditor({ sourceText: text, sessionKey, onApply: applyRevision })

  const saveDraft = useCallback(async (input: NoteInput) => {
    const wasEditing = Boolean(editingNote)
    await onSubmit(input)
    aiEditor.reset()
    if (!wasEditing) {
      setText('')
      setTagInput('')
      setMode('write')
    }
  }, [aiEditor.reset, editingNote, onSubmit])

  const formatter = useAiFormatter({
    sessionKey,
    onSave: saveDraft,
    currentInput: { text, tags },
  })
  const composerBusy = loading || formatter.busy || aiEditor.requesting
  const blockingExternalActions = loading || formatter.busy || formatter.dialog !== null

  useLayoutEffect(() => {
    onBlockingChange?.(blockingExternalActions)
  }, [blockingExternalActions, onBlockingChange])

  useEffect(() => () => onBlockingChange?.(false), [onBlockingChange])

  useEffect(() => {
    setText(editingNote?.text ?? '')
    setTagInput(editingNote?.tags?.join(', ') ?? '')
    setMode('write')
  }, [editingNote?.id])

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!text.trim() || overLimit || composerBusy) return
    await formatter.formatAndSave({ text, tags })
  }

  function closeAiPanel() {
    aiEditor.closePanel()
    window.setTimeout(() => aiTriggerRef.current?.focus(), 0)
  }

  return (
    <section className="nv-panel nv-col-left" aria-label={editingNote ? 'Edit note composer' : 'New note composer'}>
      <div className="nv-panel-head">
        <span className="nv-panel-label">{editingNote ? 'Edit note' : 'New note'}</span>
      </div>

      <form className="nv-composer" onSubmit={handleSubmit} aria-label={editingNote ? 'Edit note' : 'Create a new note'} noValidate>
        <div className="nv-editor-bar">
          <div className="nv-tabs" role="tablist" aria-label="Editor mode">
            <button type="button" role="tab" id="tab-write" aria-selected={mode === 'write'} aria-controls="panel-write" className={`nv-tab${mode === 'write' ? ' nv-tab--active' : ''}`} onClick={() => setMode('write')}>
              <PenIcon /> Write
            </button>
            <button type="button" role="tab" id="tab-preview" aria-selected={mode === 'preview'} aria-controls="panel-preview" className={`nv-tab${mode === 'preview' ? ' nv-tab--active' : ''}`} onClick={() => setMode('preview')}>
              <EyeIcon /> Preview
            </button>
          </div>
          <button
            ref={aiTriggerRef}
            type="button"
            className="btn btn-ghost btn-sm nv-ai-toggle"
            aria-expanded={aiEditor.panelOpen}
            aria-controls="ai-assist-panel"
            disabled={!text.trim() || overLimit || formatter.busy}
            onClick={() => aiEditor.panelOpen ? closeAiPanel() : aiEditor.openPanel()}
          >
            <SparklesIcon /> AI Assist
          </button>
        </div>

        {mode === 'write' ? (
          <div id="panel-write" role="tabpanel" aria-labelledby="tab-write">
            <label htmlFor="note-body" className="sr-only">Note body (Markdown)</label>
            <textarea
              ref={textareaRef}
              id="note-body"
              className="nv-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Write your note in Markdown…"
              rows={7}
              aria-describedby="char-counter"
              aria-invalid={overLimit}
              disabled={loading || formatter.busy}
            />
            <div id="char-counter" className={charCountClass} aria-live="polite" aria-atomic="true">
              {text.length.toLocaleString()} / {MAX_NOTE_TEXT.toLocaleString()}
              {overLimit && ' — over limit'}
            </div>
          </div>
        ) : (
          <div id="panel-preview" role="tabpanel" aria-labelledby="tab-preview" className="nv-preview">
            {text.trim() ? (
              <div className="nv-md"><SafeMarkdown>{text}</SafeMarkdown></div>
            ) : (
              <p className="nv-preview-empty">Nothing to preview yet.</p>
            )}
          </div>
        )}

        <div className="nv-md-support"><MarkdownBadge /> Markdown formatting supported</div>

        {aiEditor.panelOpen && (
          <AiAssistPanel
            instruction={aiEditor.instruction}
            messages={aiEditor.messages}
            candidateText={aiEditor.candidateText}
            requesting={aiEditor.requesting}
            error={aiEditor.error}
            draftConflict={aiEditor.draftConflict}
            candidateTooLong={aiEditor.candidateTooLong}
            canApply={aiEditor.canApply}
            locked={loading || formatter.busy}
            onInstructionChange={aiEditor.setInstruction}
            onGenerate={aiEditor.generate}
            onTryAgain={aiEditor.tryAgain}
            onDiscard={aiEditor.discard}
            onApply={() => { aiEditor.apply() }}
            onClose={closeAiPanel}
          />
        )}

        <div className="nv-tag-section">
          <div className="nv-label-row">
            <label htmlFor="tag-input" className="nv-field-label">Tags</label>
            <span className="nv-field-hint" aria-live="polite" aria-atomic="true">{tags.length} / {MAX_TAGS}</span>
          </div>
          <input
            id="tag-input"
            className="nv-input"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="work, ideas, reading… (comma-separated)"
            aria-describedby="tag-hint"
            maxLength={MAX_TAGS * (MAX_TAG_LEN + 2)}
            disabled={loading || formatter.busy}
          />
          <span id="tag-hint" className="sr-only">
            Comma-separated tags. Max {MAX_TAGS} tags, each up to {MAX_TAG_LEN} characters. Tags are lowercased and deduplicated automatically.
          </span>
          {tags.length > 0 && (
            <div className="nv-tag-row" aria-label="Parsed tags preview" aria-live="polite">
              {tags.map((tag) => <span key={tag} className="nv-tag">{tag}</span>)}
            </div>
          )}
        </div>

        <div className="nv-composer-actions">
          {editingNote && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={(event) => onCancelEditing(event.currentTarget)}
              disabled={composerBusy}
            >
              Cancel editing
            </button>
          )}
          <button
            ref={submitTriggerRef}
            type="submit"
            className="btn btn-primary nv-composer-submit"
            disabled={composerBusy || !text.trim() || overLimit || Boolean(editingNote && !dirty)}
            aria-busy={composerBusy}
          >
            {formatter.formatting
              ? 'Formatting…'
              : loading || formatter.busy
                ? 'Saving…'
                : editingNote ? 'Save changes' : 'Add note'}
          </button>
        </div>
        <AiDisclosure />
      </form>

      <AiFormatReviewDialog
        state={formatter.dialog}
        loadingAction={formatter.loadingAction}
        onApply={() => { void formatter.applyAndSave() }}
        onSaveOriginal={() => { void formatter.saveOriginal() }}
        onRetry={formatter.retry}
        onCancel={formatter.cancel}
        returnFocus={submitTriggerRef.current}
        fallbackFocus={textareaRef.current}
      />
    </section>
  )
}
