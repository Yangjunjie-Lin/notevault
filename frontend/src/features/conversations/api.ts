import { authFetch, buildApiUrl } from '../../shared/api/authFetch'
import type {
  CaptureItem,
  CaptureItemsResponse,
  CaptureSuggestion,
  Checkpoint,
  ConversationDetail,
  ConversationSummary,
} from './types'

export const conversationsApi = {
  list: (signal?: AbortSignal) =>
    authFetch<{ conversations: ConversationSummary[] }>(buildApiUrl('/conversations'), { signal }),
  get: (id: string, signal?: AbortSignal) =>
    authFetch<ConversationDetail>(buildApiUrl(`/conversations/${encodeURIComponent(id)}`), { signal }),
  remove: (id: string) =>
    authFetch<{ ok: boolean }>(buildApiUrl(`/conversations/${encodeURIComponent(id)}`), {
      method: 'DELETE',
    }),
  start: (text: string, clientRequestId: string, signal?: AbortSignal) =>
    authFetch<ConversationDetail>(buildApiUrl('/conversations'), {
      method: 'POST',
      body: JSON.stringify({ text, clientRequestId }),
      signal,
    }),
  reply: (
    conversationId: string,
    parentId: string,
    text: string,
    clientRequestId: string,
    signal?: AbortSignal,
  ) => authFetch<ConversationDetail>(
    buildApiUrl(`/conversations/${encodeURIComponent(conversationId)}/messages`),
    {
      method: 'POST',
      body: JSON.stringify({ parentId, text, clientRequestId }),
      signal,
    },
  ),
  suggest: (
    conversationId: string,
    messageId: string,
    intent: 'both' | 'notes' | 'checkpoints' = 'both',
    signal?: AbortSignal,
  ) => authFetch<{ suggestions?: CaptureSuggestion[]; model: string; traceId?: string | null }>(
    buildApiUrl(`/conversations/${encodeURIComponent(conversationId)}/suggestions`),
    {
      method: 'POST',
      body: JSON.stringify({ messageId, intent }),
      signal,
    },
  ),
  capture: (
    conversationId: string,
    sourceMessageId: string,
    clientRequestId: string,
    items: CaptureItem[],
  ) => authFetch<CaptureItemsResponse>(
    buildApiUrl(`/conversations/${encodeURIComponent(conversationId)}/captures`),
    {
      method: 'POST',
      body: JSON.stringify({ sourceMessageId, clientRequestId, items }),
    },
  ),
}

export const checkpointsApi = {
  list: (signal?: AbortSignal) =>
    authFetch<{ checkpoints: Checkpoint[] }>(buildApiUrl('/checkpoints'), { signal }),
  update: (id: string, completed: boolean) =>
    authFetch<{ checkpoint: Checkpoint }>(buildApiUrl(`/checkpoints/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    }),
}
