import { useEffect, useState } from 'react'
import type { OpenDocument, Project } from '@shared/host-api'
import { Brand } from '../components/Brand'
import { Menu, MenuItem, useDropdown } from '../components/Menu'
import { ClaudeMark, OpenExternalIcon } from '../components/icons'
import { DocumentView } from '../editor/DocumentView'
import { host, useHostValue } from '../host'

const NOTICE_MS = 2200

/** The editor: the Document on the left, the chat on the right. */
export function EditorScreen({ project, document }: { project: Project; document: OpenDocument }) {
  const [ready, setReady] = useState(false)
  const [reloaded, setReloaded] = useState(0)

  useEffect(() => {
    if (!reloaded) return
    const timer = setTimeout(() => setReloaded(0), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [reloaded])

  return (
    <div className="flex min-h-0 flex-1">
      <main className="relative mb-2 ml-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-card">
        <header className="relative z-10 flex h-12 flex-none items-center justify-between gap-3 px-3">
          <nav className="flex min-w-0 items-center gap-1" aria-label="Breadcrumb">
            <button
              className="rounded-[7px] hover:bg-black/4"
              title="Back to Start"
              aria-label="Back to Start"
              onClick={() => void host.call('projects.close')}
            >
              <Brand />
            </button>
            <Slash />
            <button className="crumb text-tx2" title="Back to the Project" onClick={() => void host.call('document.close')}>
              {project.name}
            </button>
            <Slash />
            <DocumentSwitcher document={document} />
          </nav>
          <div className="flex items-center gap-1">
            {/* The Viewport select (ticket 06) goes here. */}
            <button
              className="inline-flex h-7 items-center rounded-[7px] px-[9px] text-tx2 hover:bg-black/4 hover:text-tx"
              title="Open in browser"
              aria-label="Open in browser"
              onClick={() => void host.call('document.openInBrowser')}
            >
              <OpenExternalIcon />
            </button>
          </div>
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col">
          {reloaded > 0 && (
            <div
              key={reloaded}
              role="status"
              className="notice-in pointer-events-none absolute top-3.5 left-1/2 z-21 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] text-[#185a36] shadow-[0_4px_16px_-4px_rgba(0,0,0,.15)]"
            >
              <span className="size-1.5 rounded-full bg-mint-strong" />
              Reloaded · scroll kept
            </div>
          )}
          {/* Room at the bottom for the floating toolbar (ticket 12), which sits over the stage. */}
          <div className="stage-dots relative min-h-0 flex-1 border-t border-border px-9 pt-[34px] pb-24">
            <div
              role="region"
              aria-label="Document view"
              data-ready={ready}
              className="relative mx-auto size-full overflow-hidden rounded-[10px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.06),0_24px_60px_-24px_rgba(0,0,0,.25)]"
            >
              <DocumentView
                key={document.url}
                document={document}
                onReady={(bridge) => setReady(bridge !== null)}
                onReloaded={() => setReloaded((n) => n + 1)}
              />
              {/* Pick and Draw overlays (tickets 12–14) go here, above the Document. */}
            </div>
          </div>
        </div>
      </main>
      <ChatPanel />
    </div>
  )
}

function Slash() {
  return (
    <span className="mx-0.5 text-sm text-[#c8c8cf]" aria-hidden>
      /
    </span>
  )
}

/** The last breadcrumb: names the Document and switches to another one in the Project. */
function DocumentSwitcher({ document }: { document: OpenDocument }) {
  const { open, setOpen, ref } = useDropdown()
  const list = useHostValue('documents.list', 'documents.changed')

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        className="crumb max-w-full"
        aria-label="Switch document"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{document.name}</span>
        <span className="text-[10px] text-tx3">▼</span>
      </button>
      {open && (
        <Menu className="top-9 left-0 max-h-[60vh] w-72 overflow-y-auto">
          {list?.documents.map((doc) => (
            <MenuItem
              key={doc.path}
              current={doc.path === document.path}
              onClick={() => {
                setOpen(false)
                if (doc.path !== document.path) void host.call('document.open', doc.path).catch(() => {})
              }}
            >
              <span className="truncate">{doc.name}</span>
              {doc.dir && <small className="ml-auto flex-none font-mono text-[10.5px] font-normal text-tx3">{doc.dir}</small>}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  )
}

/** The chat panel. Ticket 07 fills it with the conversation and the Composer. */
function ChatPanel() {
  return (
    <aside aria-label="Chat" className="relative mx-2 mb-2 flex w-[370px] min-h-0 flex-none flex-col">
      <div className="flex h-11 flex-none items-center gap-2 pr-1 pl-2">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-medium">
          <ClaudeMark />
          Claude Code
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center px-8 text-center text-[13px] leading-relaxed text-tx3">
        Describe a change, or Pick and Draw on the page.
      </div>
    </aside>
  )
}
