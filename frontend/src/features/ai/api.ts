import { authFetch, buildApiUrl } from '../../shared/api/authFetch'
import type {
  AiFormatRequest,
  AiFormatResponse,
  AiRevisionRequest,
  AiRevisionResponse,
} from './types'

export const aiApi = {
  formatMarkdown: (input: AiFormatRequest, signal?: AbortSignal) =>
    authFetch<AiFormatResponse>(buildApiUrl('/ai/format-markdown'), {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  reviseNote: (input: AiRevisionRequest, signal?: AbortSignal) =>
    authFetch<AiRevisionResponse>(buildApiUrl('/ai/revise-note'), {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
}
