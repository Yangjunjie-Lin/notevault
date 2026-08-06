import type { components } from '../notes/generated'

export type AiFormatRequest = components['schemas']['AiTextRequest']
export type AiFormatResponse = components['schemas']['AiFormatResponse']
export type AiRevisionRequest = components['schemas']['AiRevisionRequest']
export type AiRevisionResponse = components['schemas']['AiRevisionResponse']

export type AiSessionMessage = {
  id: number
  instruction: string
}

