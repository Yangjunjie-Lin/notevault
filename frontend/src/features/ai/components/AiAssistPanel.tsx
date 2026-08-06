import { useEffect, useId, useRef } from 'react'

import { MAX_AI_INSTRUCTION } from '../constants'
import type { AiSessionMessage } from '../types'
import AiDisclosure from './AiDisclosure'
import AiResultPreview from './AiResultPreview'

type Props = {
  instruction: string
  messages: AiSessionMessage[]
  candidateText: string
  requesting: boolean
  error: string
  draftConflict: boolean
  candidateTooLong: boolean
  canApply: boolean
  locked: boolean
  onInstructionChange: (value: string) => void
  onGenerate: () => void
  onTryAgain: () => void
  onDiscard: () => void
  onApply: () => void
  onClose: () => void
}

function SparklesIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 1.5c.45 3.18 2.32 5.05 5.5 5.5C11.32 7.45 9.45 9.32 9 12.5 8.55 9.32 6.68 7.45 3.5 7 6.68 6.55 8.55 4.68 9 1.5zM14.2 11.2c.2 1.42 1.18 2.4 2.6 2.6-1.42.2-2.4 1.18-2.6 2.6-.2-1.42-1.18-2.4-2.6-2.6 1.42-.2 2.4-1.18 2.6-2.6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

export { SparklesIcon }

export default function AiAssistPanel({
  instruction,
  messages,
  candidateText,
  requesting,
  error,
  draftConflict,
  candidateTooLong,
  canApply,
  locked,
  onInstructionChange,
  onGenerate,
  onTryAgain,
  onDiscard,
  onApply,
  onClose,
}: Props) {
  const headingId = useId()
  const instructionId = useId()
  const instructionHintId = useId()
  const instructionRef = useRef<HTMLTextAreaElement>(null)
  const instructionOverLimit = instruction.length > MAX_AI_INSTRUCTION
  const cleanInstruction = instruction.trim()

  useEffect(() => {
    instructionRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const conflictMessage = draftConflict
    ? 'Your draft changed after this revision was generated. Generate a new revision before applying.'
    : ''

  return (
    <section id="ai-assist-panel" className="nv-ai-panel" aria-labelledby={headingId} aria-busy={requesting}>
      <div className="nv-ai-panel-head">
        <h2 id={headingId}><SparklesIcon /> AI Assist</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close AI Assist">
          Close
        </button>
      </div>
      <p className="nv-ai-intro">Describe how you want to revise the current Markdown draft.</p>
      <AiDisclosure />

      {messages.length > 0 && (
        <ol className="nv-ai-history" aria-label="AI editing session">
          {messages.map((message) => (
            <li key={message.id}>
              <span className="nv-ai-history-label">Your instruction</span>
              <span>{message.instruction}</span>
              <span className="nv-ai-ready">AI revision ready</span>
            </li>
          ))}
        </ol>
      )}

      <label className="nv-field-label" htmlFor={instructionId}>Editing instruction</label>
      <textarea
        ref={instructionRef}
        id={instructionId}
        className="nv-input nv-ai-instruction"
        value={instruction}
        onChange={(event) => onInstructionChange(event.target.value)}
        placeholder="For example: Convert the steps into a checklist."
        rows={3}
        maxLength={MAX_AI_INSTRUCTION + 1}
        aria-describedby={instructionHintId}
        aria-invalid={instructionOverLimit}
        disabled={requesting || locked}
      />
      <div id={instructionHintId} className={instructionOverLimit ? 'nv-char-count nv-char-count--over' : 'nv-char-count'}>
        {instruction.length.toLocaleString()} / {MAX_AI_INSTRUCTION.toLocaleString()}
      </div>
      <button
        type="button"
        className="btn btn-secondary nv-ai-generate"
        onClick={onGenerate}
        disabled={requesting || locked || !cleanInstruction || instructionOverLimit}
        aria-busy={requesting}
      >
        <SparklesIcon /> {requesting ? 'Generating revision…' : 'Generate revision'}
      </button>

      <div className="nv-ai-announcement" aria-live="polite" aria-atomic="true">
        {requesting ? 'AI revision in progress.' : candidateText ? 'AI revision ready for review.' : ''}
      </div>
      {(error || conflictMessage) && (
        <p className="nv-ai-inline-error" role="alert">{conflictMessage || error}</p>
      )}

      {candidateText && <AiResultPreview text={candidateText} />}

      {candidateText && (
        <div className="nv-ai-actions">
          <button type="button" className="btn btn-ghost" onClick={onDiscard} disabled={requesting || locked}>
            Discard
          </button>
          <button type="button" className="btn btn-secondary" onClick={onTryAgain} disabled={requesting || locked || draftConflict}>
            Try again
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onApply}
            disabled={locked || !canApply || candidateTooLong}
          >
            Apply to draft
          </button>
        </div>
      )}
    </section>
  )
}
