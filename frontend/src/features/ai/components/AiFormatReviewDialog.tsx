import ConfirmDialog from '../../../shared/components/ConfirmDialog'
import type { AiFormatDialogState } from '../hooks/useAiFormatter'
import AiDisclosure from './AiDisclosure'
import { SparklesIcon } from './AiAssistPanel'

type Props = {
  state: AiFormatDialogState | null
  loadingAction: 'format' | 'apply' | 'original' | null
  onApply: () => void
  onSaveOriginal: () => void
  onRetry: () => void
  onCancel: () => void
  returnFocus?: HTMLElement | null
  fallbackFocus?: HTMLElement | null
}

export default function AiFormatReviewDialog({
  state,
  loadingAction,
  onApply,
  onSaveOriginal,
  onRetry,
  onCancel,
  returnFocus,
  fallbackFocus,
}: Props) {
  const isReview = state?.kind === 'review'
  const loading = loadingAction !== null
  const confirmLabel = isReview ? 'Apply & Save' : 'Retry AI formatting'
  const loadingLabel = loadingAction === 'apply' || loadingAction === 'format'
    ? (isReview ? 'Saving…' : 'Retrying…')
    : confirmLabel

  return (
    <ConfirmDialog
      open={state !== null}
      loading={loading}
      title={isReview ? 'Review AI formatting' : 'AI formatting unavailable'}
      accessibleDescription={isReview
        ? 'Compare the original and AI-formatted Markdown before choosing which version to save.'
        : 'AI formatting failed. Retry, save the original draft, or cancel.'}
      confirmLabel={confirmLabel}
      loadingLabel={loadingLabel}
      cancelLabel="Cancel"
      secondaryLabel={loadingAction === 'original' ? 'Saving original…' : 'Save Original'}
      onConfirm={isReview ? onApply : onRetry}
      onSecondary={onSaveOriginal}
      onCancel={onCancel}
      returnFocus={returnFocus}
      fallbackFocus={fallbackFocus}
      icon={<SparklesIcon />}
      tone="ai"
      confirmVariant="primary"
      wide
    >
      <AiDisclosure />
      {state?.kind === 'error' ? (
        <p className="nv-ai-format-error" role="alert">{state.error}</p>
      ) : state?.kind === 'review' ? (
        <div className="nv-ai-format-review">
          <section aria-labelledby="ai-original-title">
            <h3 id="ai-original-title">Original</h3>
            <pre tabIndex={0} aria-label="Original Markdown">{state.originalText}</pre>
          </section>
          <section aria-labelledby="ai-formatted-title">
            <h3 id="ai-formatted-title">Formatted</h3>
            <pre tabIndex={0} aria-label="Formatted Markdown">{state.formattedText}</pre>
          </section>
        </div>
      ) : null}
    </ConfirmDialog>
  )
}
