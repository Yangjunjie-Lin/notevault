import { useCallback, useEffect, useRef, useState } from 'react'

import type { NoteInput } from '../../notes/types'
import { aiApi } from '../api'
import { MAX_NOTE_TEXT } from '../constants'

export type AiFormatDialogState =
  | {
      kind: 'review'
      originalText: string
      formattedText: string
    }
  | {
      kind: 'error'
      originalText: string
      error: string
    }

type LoadingAction = 'format' | 'apply' | 'original' | null

type Options = {
  sessionKey: string
  onSave: (input: NoteInput) => Promise<void>
  currentInput: NoteInput
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'AI formatting failed. You can retry or save your original draft.'
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function inputsMatch(left: NoteInput, right: NoteInput) {
  const leftTags = left.tags ?? []
  const rightTags = right.tags ?? []
  return left.text === right.text
    && leftTags.length === rightTags.length
    && leftTags.every((tag, index) => tag === rightTags[index])
}

export default function useAiFormatter({ sessionKey, onSave, currentInput }: Options) {
  const [dialog, setDialog] = useState<AiFormatDialogState | null>(null)
  const [pending, setPending] = useState<NoteInput | null>(null)
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null)
  const requestVersion = useRef(0)
  const abortController = useRef<AbortController | null>(null)
  const onSaveRef = useRef(onSave)
  const currentInputRef = useRef(currentInput)
  onSaveRef.current = onSave
  currentInputRef.current = currentInput

  const reset = useCallback(() => {
    requestVersion.current += 1
    abortController.current?.abort()
    abortController.current = null
    setDialog(null)
    setPending(null)
    setLoadingAction(null)
  }, [])

  useEffect(() => reset(), [reset, sessionKey])
  useEffect(() => () => {
    requestVersion.current += 1
    abortController.current?.abort()
  }, [])

  const showDraftChanged = useCallback(() => {
    const latest = currentInputRef.current
    const preserved = { text: latest.text, tags: [...(latest.tags ?? [])] }
    setPending(preserved)
    setDialog({
      kind: 'error',
      originalText: preserved.text,
      error: 'Your draft changed while AI formatting was running. Retry formatting before saving.',
    })
    setLoadingAction(null)
  }, [])

  const commit = useCallback(async (
    input: NoteInput,
    action: Exclude<LoadingAction, 'format' | null>,
    expectedDraft: NoteInput,
  ) => {
    if (!inputsMatch(currentInputRef.current, expectedDraft)) {
      showDraftChanged()
      return false
    }
    setLoadingAction(action)
    try {
      await onSaveRef.current(input)
      reset()
      return true
    } catch {
      // The notes workspace owns save errors and keeps the Composer draft intact.
      setLoadingAction(null)
      return false
    }
  }, [reset, showDraftChanged])

  const formatAndSave = useCallback(async (input: NoteInput) => {
    if (abortController.current || loadingAction) return false

    const controller = new AbortController()
    abortController.current = controller
    const version = ++requestVersion.current
    setPending(input)
    setDialog(null)
    setLoadingAction('format')

    try {
      const response = await aiApi.formatMarkdown({ text: input.text }, controller.signal)
      if (controller.signal.aborted || version !== requestVersion.current) return false
      abortController.current = null
      if (!inputsMatch(currentInputRef.current, input)) {
        showDraftChanged()
        return false
      }

      if (typeof response.text !== 'string' || !response.text.trim()) {
        setDialog({
          kind: 'error',
          originalText: input.text,
          error: 'AI returned an empty result. Your original draft is still available.',
        })
        setLoadingAction(null)
        return false
      }
      if (response.text.length > MAX_NOTE_TEXT) {
        setDialog({
          kind: 'error',
          originalText: input.text,
          error: `AI formatting exceeded the ${MAX_NOTE_TEXT.toLocaleString()} character limit. Your original draft is unchanged.`,
        })
        setLoadingAction(null)
        return false
      }

      // The local comparison prevents an inconsistent server flag from
      // bypassing review and silently replacing the submitted draft.
      if (response.text !== input.text) {
        setDialog({ kind: 'review', originalText: input.text, formattedText: response.text })
        setLoadingAction(null)
        return false
      }

      return commit(input, 'original', input)
    } catch (formatError) {
      if (!controller.signal.aborted && version === requestVersion.current && !isAbortError(formatError)) {
        setDialog({ kind: 'error', originalText: input.text, error: message(formatError) })
        setLoadingAction(null)
      }
      return false
    } finally {
      if (abortController.current === controller) abortController.current = null
    }
  }, [commit, loadingAction, showDraftChanged])

  const applyAndSave = useCallback(async () => {
    if (!pending || dialog?.kind !== 'review') return false
    return commit({ text: dialog.formattedText, tags: pending.tags }, 'apply', pending)
  }, [commit, dialog, pending])

  const saveOriginal = useCallback(async () => {
    if (!pending) return false
    return commit(pending, 'original', pending)
  }, [commit, pending])

  const retry = useCallback(() => {
    if (pending && !loadingAction) void formatAndSave(pending)
  }, [formatAndSave, loadingAction, pending])

  const cancel = useCallback(() => {
    if (!loadingAction) reset()
  }, [loadingAction, reset])

  return {
    dialog,
    loadingAction,
    busy: loadingAction !== null,
    formatting: loadingAction === 'format',
    formatAndSave,
    applyAndSave,
    saveOriginal,
    retry,
    cancel,
    reset,
  }
}
