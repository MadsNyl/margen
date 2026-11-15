import { useEffect, useRef, useState } from 'react'
import type { Mode } from '@shared/document-bridge'
import type { OpenDocument, Project } from '@shared/host-api'
import { isVideoTemplate, templatePage, type MarkedTemplateId } from '@shared/templates'
import type { ViewportChoice } from '@shared/viewport'
import { Brand } from '../components/Brand'
import { Menu, MenuItem, useDropdown } from '../components/Menu'
import { AddIcon, ChevronDownIcon, HideChatIcon, OpenExternalIcon, ShowChatIcon } from '../components/icons'
import { ChatPanel } from '../editor/ChatPanel'
import { DocumentView } from '../editor/DocumentView'
import type { DocumentBridge } from '../editor/bridge'
import { PausedTimeProvider, TIME_BAR_ROOM, TimeBar, useVideoClock } from '../editor/clock'
import { DraftProvider } from '../editor/draft'
import { ExportMenu } from '../editor/export'
import { VoiceSelect, useNarration } from '../editor/narration'
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
  // The marker as the page last loaded it says, so a reload that adds or removes it shows or hides the video controls.
  const [marker, setMarker] = useState<{ url: string; template?: MarkedTemplateId }>()
  const template = marker?.url === document.url ? marker.template : document.template
  const video = isVideoTemplate(template)
  const page = templatePage(template)
  const narration = useNarration(bridge, video, document)
  const clock = useVideoClock(bridge, video, document.url, narration.end)
  // An Animation video always shows its whole frame, a Poster or Slides its whole page, fitted to the window.
  const fixed = video || page !== undefined
  const fitted = fit || fixed
  const screen = video ? (clock?.state?.frame ?? SCREENS.desktop) : (page ?? SCREENS[choice])
  const measured = useMeasuredViewport(choice, frame, fitted)
  const viewport = fixed ? { ...measured, width: screen.width } : measured
  const room = useRoom(stage)
  // An Animation video's time bar sits under its frame, so the frame fits in what's left.
  const scale = fitScale(screen, video ? { ...room, height: room.height - TIME_BAR_ROOM } : room)

  // Pick and Draw work on the paused frame.
  useEffect(() => {
    if (video && mode !== 'browse') bridge?.send({ type: 'clock-pause' })
  }, [bridge, video, mode])

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
      <PausedTimeProvider value={clock?.state?.time}>
      <LeaveGuard>
      <DraftProvider document={document.path}>
      <ModeShortcuts bridge={bridge} mode={mode} onMode={setMode} />
      <div className="flex min-h-0 flex-1">
        <main className="relative mb-2 ml-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-card">
          <header className="relative z-10 flex h-12 flex-none items-center justify-between gap-3 px-3">
            <Breadcrumb project={project} document={document} />
            <div className="flex items-center gap-1">
              {clock ? (
                <ExportMenu formats={['mp4']} ready={clock.state !== undefined} />
              ) : page ? (
                <ExportMenu formats={['pdf']} ready />
              ) : (
                <>
                  <FitButton fit={fit} scale={scale} onFit={setFit} />
                  <ViewportSelect choice={choice} viewport={viewport} fit={fit} onChoose={setChoice} />
                </>
              )}
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
                Reloaded · {video ? 'time' : 'scroll'} kept
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
              {/* An Animation video's frame and the time bar under it, as wide as the frame. */}
              <div className={clock ? 'mx-auto flex flex-col gap-2.5' : 'contents'} style={clock ? { width: screen.width * scale } : undefined}>
              <div
                ref={frame}
                role="region"
                aria-label="Document view"
                data-ready={bridge !== null}
                data-fit={fitted || undefined}
                style={fitted ? { width: screen.width * scale, height: screen.height * scale } : { width: frameWidth(choice) }}
                className={`relative mx-auto overflow-hidden rounded-[10px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.06),0_24px_60px_-24px_rgba(0,0,0,.25)] ${fitted ? '' : 'h-full transition-[width] duration-[450ms] ease-[cubic-bezier(.6,.1,.2,1)]'}`}
              >
                {/* With Fit on, the Document is laid out at the whole screen and scaled down. */}
                <div
                  ref={canvas}
                  className={fitted ? 'absolute top-0 left-0 origin-top-left' : 'relative size-full'}
                  style={fitted ? { width: screen.width, height: screen.height, transform: `scale(${scale})` } : undefined}
                >
                  <DocumentView
                    key={document.url}
                    document={document}
                    onReady={(ready, template) => {
                      setBridge(ready)
                      if (ready) setMarker({ url: document.url, template })
                    }}
                    onReloaded={() => {
                      setReloaded((n) => n + 1)
                      setReloads((n) => n + 1)
                    }}
                  />
                </div>
                {/* Over the view but not scaled with it, so markers and the comment box keep their size. */}
                <DrawLayer bridge={bridge} mode={mode} frame={canvas} scale={fitted ? scale : 1} />
                <PickLayer bridge={bridge} mode={mode} reloads={reloads} scale={fitted ? scale : 1} canvas={canvas} onKeyGuide={setKeyGuide} />
              </div>
              {clock && (
                <TimeBar clock={clock} marks={narration.narration?.lines.map((line) => line.start) ?? []}>
                  <VoiceSelect narration={narration} />
                </TimeBar>
              )}
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
      </PausedTimeProvider>
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
