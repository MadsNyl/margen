import { useEffect, useRef, useState } from 'react'
import type { Mode } from '@shared/document-bridge'
import type { OpenDocument, Project } from '@shared/host-api'
import type { ViewportChoice } from '@shared/viewport'
import { Brand } from '../components/Brand'
import { Menu, MenuItem, useDropdown } from '../components/Menu'
import { AddIcon, ChevronDownIcon, HideChatIcon, OpenExternalIcon, ShowChatIcon } from '../components/icons'
import { ChatPanel } from '../editor/ChatPanel'
import { DocumentView } from '../editor/DocumentView'
import type { DocumentBridge } from '../editor/bridge'
import { DraftProvider } from '../editor/draft'
import { DrawLayer } from '../editor/DrawLayer'
import { HiddenChatBar } from '../editor/HiddenChatBar'
import { LeaveGuard, useLeave } from '../editor/leave'
import { ModeShortcuts } from '../editor/ModeShortcuts'
import { NewDocumentDialog } from '../editor/NewDocument'
import { PickLayer } from '../editor/PickLayer'
import { Toolbar } from '../editor/Toolbar'
import { FitButton, ViewportProvider, ViewportSelect, frameWidth, useMeasuredViewport, useRoom } from '../editor/viewport'
import { SCREENS, fitScale } from '@shared/viewport'
import { errorMessage, host, useHostValue } from '../host'

const NOTICE_MS = 2200

/** The editor: the Document on the left, the chat on the right. */
export function EditorScreen({ project, document }: { project: Project; document: OpenDocument }) {
  const [bridge, setBridge] = useState<DocumentBridge | null>(null)
  const [mode, setMode] = useState<Mode>('browse')
  const [reloaded, setReloaded] = useState(0)
  const [reloads, setReloads] = useState(0)
  const [choice, setChoice] = useState<ViewportChoice>('desktop')
  const [keyGuide, setKeyGuide] = useState(false)
  const [fit, setFit] = useState(false)
  const [chatOpen, setChatOpen] = useState(true)
  const frame = useRef<HTMLDivElement>(null)
  /** The Document's own box: the frame at actual size, or a whole screen scaled down inside it with Fit on. */
  const canvas = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const viewport = useMeasuredViewport(choice, frame, fit)
  const screen = SCREENS[choice]
  const scale = fitScale(screen, useRoom(stage))

  useEffect(() => {
    if (!reloaded) return
    const timer = setTimeout(() => setReloaded(0), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [reloaded])

  // A text edit made by hand in the Document goes to the file; if it can't, the text goes back and the notice says why.
  const [editFailed, setEditFailed] = useState<{ n: number; message: string }>()
  useEffect(() => {
    if (!bridge) return
    return bridge.on((message) => {
      if (message.type !== 'text-edit') return
      const { selector, before, after } = message
      host.call('document.editText', { selector, before, after }).catch((error: unknown) => {
        bridge.send({ type: 'text-edit-failed' })
        setEditFailed((last) => ({ n: (last?.n ?? 0) + 1, message: errorMessage(error) }))
      })
    })
  }, [bridge])
  useEffect(() => {
    if (!editFailed) return
    const timer = setTimeout(() => setEditFailed(undefined), NOTICE_MS * 2)
    return () => clearTimeout(timer)
  }, [editFailed])

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
              <FitButton fit={fit} scale={scale} onFit={setFit} />
              <ViewportSelect choice={choice} viewport={viewport} fit={fit} onChoose={setChoice} />
              <button
                className="inline-flex h-7 items-center rounded-[7px] px-[9px] text-tx2 hover:bg-black/4 hover:text-tx"
                title="Open in browser"
                aria-label="Open in browser"
                onClick={() => void host.call('document.openInBrowser')}
              >
                <OpenExternalIcon />
              </button>
              <button
                className="inline-flex h-7 items-center rounded-[7px] px-[9px] text-tx2 hover:bg-black/4 hover:text-tx"
                title={chatOpen ? 'Hide the chat' : 'Show the chat'}
                aria-label={chatOpen ? 'Hide the chat' : 'Show the chat'}
                aria-pressed={chatOpen}
                onClick={() => setChatOpen(!chatOpen)}
              >
                {chatOpen ? <HideChatIcon /> : <ShowChatIcon />}
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
            {editFailed && (
              <div
                key={`edit-${editFailed.n}`}
                role="alert"
                className="notice-in pointer-events-none absolute top-3.5 left-1/2 z-21 flex max-w-[80%] -translate-x-1/2 items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] text-tx2 shadow-[0_4px_16px_-4px_rgba(0,0,0,.15)]"
              >
                <span className="size-1.5 flex-none rounded-full bg-[#e5484d]" />
                <span className="truncate">Not saved: {editFailed.message}</span>
              </div>
            )}
            <Toolbar mode={mode} onMode={setMode} keyGuide={keyGuide} />
            {!chatOpen && <HiddenChatBar document={document.path} onShowChat={() => setChatOpen(true)} />}
            {/* Room at the bottom for the floating toolbar, which sits over the stage. */}
            {/* A fixed Viewport wider than the window scrolls sideways rather than shrinking. */}
            <div ref={stage} className="stage-dots relative min-h-0 flex-1 overflow-x-auto border-t border-border px-9 pt-[34px] pb-24">
              <div
                ref={frame}
                role="region"
                aria-label="Document view"
                data-ready={bridge !== null}
                data-fit={fit || undefined}
                style={fit ? { width: screen.width * scale, height: screen.height * scale } : { width: frameWidth(choice) }}
                className={`relative mx-auto overflow-hidden rounded-[10px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.06),0_24px_60px_-24px_rgba(0,0,0,.25)] ${fit ? '' : 'h-full transition-[width] duration-[450ms] ease-[cubic-bezier(.6,.1,.2,1)]'}`}
              >
                {/* With Fit on, the Document and its overlays are laid out at the whole screen and scaled down together. */}
                <div
                  ref={canvas}
                  className={fit ? 'absolute top-0 left-0 origin-top-left' : 'relative size-full'}
                  style={fit ? { width: screen.width, height: screen.height, transform: `scale(${scale})` } : undefined}
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
                  <DrawLayer bridge={bridge} mode={mode} frame={canvas} />
                  <PickLayer bridge={bridge} mode={mode} reloads={reloads} onKeyGuide={setKeyGuide} />
                </div>
              </div>
            </div>
          </div>
        </main>
        {/* Hidden rather than closed, so the draft, the Queue and a running Turn carry on. */}
        <div className={chatOpen ? 'contents' : 'hidden'}>
          <ChatPanel key={document.url} document={document.path} />
        </div>
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
  const [creating, setCreating] = useState(false)

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
        <ChevronDownIcon />
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
          <div className="my-1 border-t border-line" />
          <MenuItem
            onClick={() => {
              setOpen(false)
              setCreating(true)
            }}
          >
            <AddIcon className="size-4 text-tx2" />
            New Document…
          </MenuItem>
        </Menu>
      )}
      {creating && <NewDocumentDialog onClose={() => setCreating(false)} />}
    </div>
  )
}
