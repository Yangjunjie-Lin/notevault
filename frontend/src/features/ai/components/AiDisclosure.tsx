function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7v4M8 4.75h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function AiDisclosure() {
  return (
    <p className="nv-ai-disclosure">
      <InfoIcon />
      <span>
        When you use AI formatting or AI Assist, your current draft is sent to SiliconFlow for AI processing.
        {' '}Powered by DeepSeek V4 Flash via SiliconFlow.
      </span>
    </p>
  )
}

