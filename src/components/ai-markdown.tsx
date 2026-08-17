import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function AiMarkdown({ content }: { content: string }) {
  return (
    <div className="ai-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a({ href, children, ...props }) {
            const external =
              href !== undefined &&
              !href.startsWith('/') &&
              !href.startsWith('#')
            return (
              <a
                {...props}
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer' : undefined}
              >
                {children}
              </a>
            )
          },
          img() {
            return null
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
