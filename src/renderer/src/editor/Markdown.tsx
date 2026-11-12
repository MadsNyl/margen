import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Headings come out as bold body text, so a reply never takes more room than its words.
const heading = ({ children }: { children?: React.ReactNode }) => <p className="md-heading">{children}</p>

const COMPONENTS: Components = {
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  h5: heading,
  h6: heading,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
}

/** The Agent's reply as compact markdown. Raw HTML in it is shown as text, never rendered. */
export function Reply({ text }: { text: string }) {
  return (
    <div className="md select-text">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  )
}
