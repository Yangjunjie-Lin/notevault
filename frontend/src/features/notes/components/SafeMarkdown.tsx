import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Props = {
  children: string
}

export default function SafeMarkdown({ children }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      urlTransform={defaultUrlTransform}
      components={{
        img: ({ alt }) => (
          <span className="nv-md-image-blocked" role="note">
            Remote image blocked{alt ? `: ${alt}` : ''}
          </span>
        ),
        input: ({ node: _node, type, checked, ...props }) => (
          <input
            {...props}
            type={type}
            checked={checked}
            aria-label={type === 'checkbox'
              ? checked ? 'Completed task' : 'Incomplete task'
              : undefined}
          />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
