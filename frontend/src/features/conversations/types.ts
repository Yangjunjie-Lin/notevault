import type { components } from '../notes/generated'

export type ConversationSummary = components['schemas']['ConversationSummary']
export type ConversationDetail = components['schemas']['ConversationDetail']
export type ConversationMessage = components['schemas']['ConversationMessageOut']
export type CaptureSuggestion = components['schemas']['CaptureSuggestion']
export type CaptureItem = components['schemas']['CaptureItem']
export type CaptureItemsResponse = components['schemas']['CaptureItemsResponse']
export type Checkpoint = components['schemas']['CheckpointOut']

export function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
