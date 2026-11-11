import { useEffect, useRef, useState } from 'react'
import type { Mode } from '@shared/document-bridge'
import type { OpenDocument, Project } from '@shared/host-api'
import type { ViewportChoice } from '@shared/viewport'
import { Brand } from '../components/Brand'
import { Menu, MenuItem, useDropdown } from '../components/Menu'
import { OpenExternalIcon } from '../components/icons'
import { ChatPanel } from '../editor/ChatPanel'
import { DocumentView } from '../editor/DocumentView'
import type { DocumentBridge } from '../editor/bridge'
import { DraftProvider } from '../editor/draft'
import { DrawLayer } from '../editor/DrawLayer'
import { LeaveGuard, useLeave } from '../editor/leave'
import { ModeShortcuts } from '../editor/ModeShortcuts'
import { PickLayer } from '../editor/PickLayer'
import { Toolbar } from '../editor/Toolbar'
import { ViewportProvider, ViewportSelect, frameWidth, useMeasuredViewport } from '../editor/viewport'
import { host, useHostValue } from '../host'

const NOTICE_MS = 2200

/** The editor: the Document on the left, the chat on the right. */
export function EditorScreen({ project, document }: { project: Project; document: OpenDocument }) {
  const [bridge, setBridge] = useState<DocumentBridge | null>(null)
  const [mode, setMode] = useState<Mode>('browse')
  const [reloaded, setReloaded] = useState(0)
  const [reloads, setReloads] = useState(0)
  const [choice, setChoice] = useState<ViewportChoice>('desktop')
  const [keyGuide, setKeyGuide] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const viewport = useMeasuredViewport(choice, frame)

  useEffect(() => {
    if (!reloaded) return
    const timer = setTimeout(() => setReloaded(0), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [reloaded])

  return (
    <ViewportProvider value={viewport}>
      <LeaveGuard>
      <DraftProvider document={document.path}>
      <ModeShortcuts bridge={bridge} mode={mode} onMode={setMode} />
      <div className="flex min-h-0 flex-1">
        <main className="relative mb-2 ml-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-card">
          <header className="relative z-10 flex h-12 flex-none items-center justify-between gap-3 px-3">
            <Breadcrumb project={project} document={document} />
            <div className="flex items-center gap-1">
              <ViewportSelect choice={choice} viewport={viewport} onChoose={setChoice} />
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
            <Toolbar mode={mode} onMode={setMode} keyGuide={keyGuide} />
            {/* Room at the bottom for the floating toolbar, which sits over the stage. */}
            {/* A fixed Viewport wider than the window scrolls sideways rather than shrinking. */}
            <div className="stage-dots relative min-h-0 flex-1 overflow-x-auto border-t border-border px-9 pt-[34px] pb-24">
              <div
                ref={frame}
                role="region"
                aria-label="Document view"
                data-ready={bridge !== null}
                style={{ width: frameWidth(choice) }}
                className="relative mx-auto h-full overflow-hidden transition-[width] duration-[450ms] ease-[cubic-bezier(.6,.1,.2,1)] rounded-[10px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.06),0_24px_60px_-24px_rgba(0,0,0,.25)]"
              >
                <DocumentView
                  key={document.url}
                  document={document}
                  onReady={setBridge}
                  onReloaded={() => {
                    setReloaded((n) => n + 1)
                    setReloads((n) => n + 1)
                  }}
                />
                <DrawLayer bridge={bridge} mode={mode} frame={frame} />
                <PickLayer bridge={bridge} mode={mode} reloads={reloads} onKeyGuide={setKeyGuide} />
              </div>
            </div>
          </div>
        </main>
        <ChatPanel key={document.url} document={document.path} />
      </div>
      </DraftProvider>
      </LeaveGuard>
    </ViewportProvider>
  )
}

function Slash() {
  return (
    <span className="mx-0.5 text-sm text-[#c8c8cf]" aria-hidden>
      /
    </span>
  )
}

/** Back to Start, back to the Project, and the Document switcher. Each leaves the Session, so asks first while a Turn runs. */
function Breadcrumb({ project, document }: { project: Project; document: OpenDocument }) {
  const leave = useLeave()
  return (
    <nav className="flex min-w-0 items-center gap-1" aria-label="Breadcrumb">
      <button
        className="rounded-[7px] hover:bg-black/4"
        title="Back to Start"
        aria-label="Back to Start"
        onClick={() => leave(() => host.call('projects.close'))}
      >
        <Brand />
      </button>
      <Slash />
      <button className="crumb text-tx2" title="Back to the Project" onClick={() => leave(() => host.call('document.close'))}>
        {project.name}
      </button>
      <Slash />
      <DocumentSwitcher document={document} />
    </nav>
  )
}

/** The last breadcrumb: names the Document and switches to another one in the Project. */
function DocumentSwitcher({ document }: { document: OpenDocument }) {
  const { open, setOpen, ref } = useDropdown()
  const list = useHostValue('documents.list', 'documents.changed')
  const leave = useLeave()

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
                if (doc.path !== document.path) leave(() => host.call('document.open', doc.path).catch(() => {}))
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
