import { useCallback, useEffect, useRef, useState } from 'react'

import { aiApi } from '../api'
import { MAX_NOTE_TEXT } from '../constants'
import type { AiSessionMessage } from '../types'

type LastRequest = {
  text: string
  instruction: string
  sourceDraftText: string
}

type Options = {
  sourceText: string
  sessionKey: string
  onApply: (text: string) => void
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'AI revision failed. Please try again.'
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export default function useAiEditor({ sourceText, sessionKey, onApply }: Options) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [messages, setMessages] = useState<AiSessionMessage[]>([])
  const [candidateText, setCandidateText] = useState('')
  const [candidateSourceText, setCandidateSourceText] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState('')
  const requestVersion = useRef(0)
  const abortController = useRef<AbortController | null>(null)
  const lastRequest = useRef<LastRequest | null>(null)
  const nextMessageId = useRef(1)

  const reset = useCallback(() => {
    requestVersion.current += 1
    abortController.current?.abort()
    abortController.current = null
    lastRequest.current = null
    setPanelOpen(false)
    setInstruction('')
    setMessages([])
    setCandidateText('')
    setCandidateSourceText(null)
    setRequesting(false)
    setError('')
  }, [])

  useEffect(() => reset(), [reset, sessionKey])
  useEffect(() => () => {
    requestVersion.current += 1
    abortController.current?.abort()
  }, [])

  const closePanel = useCallback(() => reset(), [reset])

  const performRequest = useCallback(async (request: LastRequest) => {
    if (abortController.current || !request.text.trim() || !request.instruction.trim()) return

    const controller = new AbortController()
    abortController.current = controller
    const version = ++requestVersion.current
    lastRequest.current = request
    setRequesting(true)
    setError('')

    try {
      const response = await aiApi.reviseNote(
        { text: request.text, instruction: request.instruction },
        controller.signal,
      )
      if (controller.signal.aborted || version !== requestVersion.current) return

      if (typeof response.text !== 'string' || !response.text.trim()) {
        setError('AI returned an empty revision. Your draft was not changed.')
        return
      }

      setCandidateText(response.text)
      setCandidateSourceText(request.sourceDraftText)
      setMessages((current) => [
        ...current,
        { id: nextMessageId.current++, instruction: request.instruction },
      ])
      if (response.text.length > MAX_NOTE_TEXT) {
        setError(
          `The proposed revision exceeds the ${MAX_NOTE_TEXT.toLocaleString()} character limit and cannot be applied.`,
        )
      }
    } catch (requestError) {
      if (!controller.signal.aborted && version === requestVersion.current && !isAbortError(requestError)) {
        setError(errorMessage(requestError))
      }
    } finally {
      if (version === requestVersion.current) {
        abortController.current = null
        setRequesting(false)
      }
    }
  }, [])

  const generate = useCallback(() => {
    const cleanInstruction = instruction.trim()
    const conflict = candidateSourceText !== null && candidateSourceText !== sourceText
    const baseText = conflict ? sourceText : candidateText || sourceText
    if (!cleanInstruction || !baseText.trim()) return
    if (baseText.length > MAX_NOTE_TEXT) {
      setError(
        `The current Markdown exceeds the ${MAX_NOTE_TEXT.toLocaleString()} character limit and cannot be sent for revision.`,
      )
      return
    }
    const sourceDraftText = conflict
      ? sourceText
      : candidateSourceText ?? sourceText
    if (conflict) {
      lastRequest.current = null
      setMessages([])
      setCandidateText('')
      setCandidateSourceText(null)
      setError('')
    }
    void performRequest({ text: baseText, instruction: cleanInstruction, sourceDraftText })
  }, [candidateSourceText, candidateText, instruction, performRequest, sourceText])

  const tryAgain = useCallback(() => {
    const request = lastRequest.current
    if (request && request.sourceDraftText === sourceText) void performRequest(request)
  }, [performRequest, sourceText])

  const discard = useCallback(() => {
    if (requesting) return
    lastRequest.current = null
    setCandidateText('')
    setCandidateSourceText(null)
    setMessages([])
    setError('')
  }, [requesting])

  const draftConflict = candidateSourceText !== null && candidateSourceText !== sourceText
  const candidateTooLong = candidateText.length > MAX_NOTE_TEXT
  const canApply = Boolean(candidateText.trim()) && !candidateTooLong && !draftConflict && !requesting

  const apply = useCallback(() => {
    if (!candidateText.trim()) {
      setError('AI returned an empty revision. Your draft was not changed.')
      return false
    }
    if (candidateText.length > MAX_NOTE_TEXT) {
      setError(
        `The proposed revision exceeds the ${MAX_NOTE_TEXT.toLocaleString()} character limit and cannot be applied.`,
      )
      return false
    }
    if (candidateSourceText !== sourceText) {
      setError('Your draft changed after this revision was generated. Generate a new revision before applying.')
      return false
    }
    onApply(candidateText)
    reset()
    return true
  }, [candidateSourceText, candidateText, onApply, reset, sourceText])

  return {
    panelOpen,
    instruction,
    messages,
    candidateText,
    requesting,
    error,
    draftConflict,
    candidateTooLong,
    canApply,
    hasCandidate: Boolean(candidateText),
    setInstruction,
    openPanel: () => setPanelOpen(true),
    closePanel,
    generate,
    tryAgain,
    discard,
    apply,
    reset,
  }
}
