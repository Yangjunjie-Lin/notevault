import { useId, useState } from 'react'

import SafeMarkdown from '../../notes/components/SafeMarkdown'

type Props = {
  text: string
}

export default function AiResultPreview({ text }: Props) {
  const [mode, setMode] = useState<'preview' | 'source'>('preview')
  const id = useId()
  const previewTabId = `${id}-preview-tab`
  const sourceTabId = `${id}-source-tab`
  const previewPanelId = `${id}-preview-panel`
  const sourcePanelId = `${id}-source-panel`

  return (
    <div className="nv-ai-result">
      <div className="nv-ai-result-head">
        <h3>Proposed revision</h3>
        <div className="nv-ai-view-tabs" role="tablist" aria-label="Proposed revision view">
          <button
            type="button"
            role="tab"
            id={previewTabId}
            aria-selected={mode === 'preview'}
            aria-controls={previewPanelId}
            className={mode === 'preview' ? 'nv-ai-view-tab nv-ai-view-tab--active' : 'nv-ai-view-tab'}
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
          <button
            type="button"
            role="tab"
            id={sourceTabId}
            aria-selected={mode === 'source'}
            aria-controls={sourcePanelId}
            className={mode === 'source' ? 'nv-ai-view-tab nv-ai-view-tab--active' : 'nv-ai-view-tab'}
            onClick={() => setMode('source')}
          >
            View source
          </button>
        </div>
      </div>
      {mode === 'preview' ? (
        <div
          id={previewPanelId}
          role="tabpanel"
          aria-labelledby={previewTabId}
          className="nv-ai-result-body nv-md"
          tabIndex={0}
        >
          <SafeMarkdown>{text}</SafeMarkdown>
        </div>
      ) : (
        <pre
          id={sourcePanelId}
          role="tabpanel"
          aria-labelledby={sourceTabId}
          className="nv-ai-result-source"
          tabIndex={0}
        >
          {text}
        </pre>
      )}
    </div>
  )
}

