import { useEffect, useRef, useState } from 'react'
import type { DocumentInfo, DocumentList, Project } from '@shared/host-api'
import { TEMPLATES, type TemplateInfo } from '@shared/templates'
import { Brand } from '../components/Brand'
import { ItemRow } from '../components/Cover'
import { Menu, MenuHeading, MenuItem, useDropdown } from '../components/Menu'
import { TemplateChip, useMentions } from '../components/Mentions'
import { useOpenSettings } from '../components/Settings'
import { UpdateButton } from '../components/UpdateButton'
import { ArrowUpIcon, ChevronDownIcon, HtmlFileIcon, MicIcon, SettingsIcon, SmallFolderIcon, TemplateIcon } from '../components/icons'
import { editedAgo, joinList, plural } from '../format'
import { host, useHostValue } from '../host'
import { NewDocumentDialog } from '../editor/NewDocument'

export function ProjectPage({ project }: { project: Project }) {
  const list = useHostValue('documents.list', 'documents.changed')
  const openSettings = useOpenSettings()

  return (
    <main className="relative mx-2 mb-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-card">
      <div className="grain-banner" aria-hidden />
      <header className="relative z-10 flex h-12 flex-none items-center justify-between px-3">
        <button
          className="rounded-[7px] hover:bg-black/4"
          title="Back to Start"
          aria-label="Back to Start"
          onClick={() => void host.call('projects.close')}
        >
          <Brand />
        </button>
        <span className="flex items-center gap-0.5">
          <UpdateButton />
          <button className="icon-btn" title="Settings" aria-label="Settings" onClick={openSettings}>
            <SettingsIcon />
          </button>
        </span>
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-6 pt-7">
          <ProjectSwitcher project={project} />
          <BuildTitle />
          <ChatBar documents={list?.documents ?? []} />
          <TemplateCards />
        </div>
        <div className="mx-auto w-[min(1000px,100%)] px-8 pt-16 pb-10">
          {list && <Documents project={project} list={list} />}
        </div>
      </div>
    </main>
  )
}

function Documents({ project, list: { documents, hidden } }: { project: Project; list: DocumentList }) {
  if (documents.length === 0) {
    return (
      <>
        <FilesHeader title="Documents" project={project} />
        <section className="ocean">
          <h3>Nothing here yet</h3>
          <p>Describe the first page above, and Claude will make it.</p>
        </section>
      </>
    )
  }
  return (
    <>
      <FilesHeader
        title={plural(documents.length, 'Document')}
        project={project}
        note={hidden.length ? `${joinList(hidden)} ${hidden.length === 1 ? 'is' : 'are'} hidden` : undefined}
      />
      <ul aria-label="Documents" className="m-0 grid list-none grid-cols-3 gap-x-6 gap-y-2 p-0">
        {documents.map((doc) => (
          <li key={doc.path} className="min-w-0">
            <ItemRow
              coverId={`${project.name}/${doc.path}`}
              badge={<HtmlFileIcon />}
              name={doc.name}
              dir={doc.dir}
              meta={editedAgo(doc.modifiedAt)}
              onClick={() => void host.call('document.open', doc.path).catch(() => {})}
            />
          </li>
        ))}
      </ul>
    </>
  )
}

function FilesHeader({ title, project, note }: { title: string; project: Project; note?: string }) {
  return (
    <div className="mx-2 mb-2.5 flex items-baseline gap-4">
      <h2 className="m-0 text-[13px] font-medium text-tx2">{title}</h2>
      {note && <small className="min-w-0 truncate text-xs text-tx3">{note}</small>}
      <button
        className="ml-auto inline-flex flex-none items-center gap-1.5 text-xs text-tx3 hover:text-tx"
        title={project.path}
        onClick={() => void host.call('project.reveal').catch(() => {})}
      >
        <SmallFolderIcon className="size-3.5" />
        Show in Finder
      </button>
    </div>
  )
}

/** The pill above the title: names the Project and switches to another. */
function ProjectSwitcher({ project }: { project: Project }) {
  const { open, setOpen, ref } = useDropdown()
  const recents = useHostValue('recents.list', 'recents.changed')
  const others = recents?.filter((r) => r.path !== project.path && !r.missing) ?? []

  const choose = (action: () => Promise<unknown>) => () => {
    setOpen(false)
    void action().catch(() => {})
  }

  return (
    <div ref={ref} className="relative">
      <button
        className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-white/75 py-0 pr-3 pl-1.5 text-[13px] shadow-[0_1px_3px_rgba(0,0,0,.04)]"
        title="Switch project"
        aria-label="Switch project"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="grid size-[22px] place-items-center rounded-full bg-yellow text-[#7a5600]">
          <SmallFolderIcon className="size-3" />
        </span>
        <span>{project.name}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <Menu className="top-10 left-1/2 w-64 -translate-x-1/2">
          {others.length > 0 && <MenuHeading>Recent</MenuHeading>}
          {others.map((recent) => (
            <MenuItem key={recent.path} onClick={choose(() => host.call('projects.open', recent.path))}>
              <span className="truncate">{recent.name}</span>
              <small className="ml-auto flex-none text-[11px] text-tx3">{plural(recent.htmlFiles, 'file')}</small>
            </MenuItem>
          ))}
          <MenuItem onClick={choose(() => host.call('projects.choose'))}>
            Open a folder… <kbd className="ml-auto">⌘O</kbd>
          </MenuItem>
          <MenuItem onClick={choose(() => host.call('projects.close'))}>Start screen</MenuItem>
        </Menu>
      )}
    </div>
  )
}

/** "Let us build" with a rotating word (after Margin's BuildTitle). */
const BUILDS = [
  ['a landing page', '#7c6cff'],
  ['an invitation', '#d63d97'],
  ['a pitch page', '#2f8cff'],
  ['a newsletter', '#17a08f'],
  ['a menu', '#1e9e5a'],
  ['a poster', '#e0a100'],
] as const

function BuildTitle() {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % BUILDS.length), 2600)
    return () => clearInterval(timer)
  }, [])
  const [word, color] = BUILDS[index] ?? BUILDS[0]

  return (
    <h1 className="m-0 mt-10 flex flex-wrap items-baseline justify-center gap-x-[.28em] text-center text-[44px] leading-[1.15] font-light tracking-[-0.025em]">
      <span>Let us build</span>
      <span className="grid overflow-hidden text-left">
        {BUILDS.map(([ghost]) => (
          <span key={ghost} className="invisible col-start-1 row-start-1 font-normal" aria-hidden>
            {ghost}
          </span>
        ))}
        <span key={word} className="build-word col-start-1 row-start-1 font-normal" style={{ color }}>
          {word}
        </span>
      </span>
    </h1>
  )
}

/**
 * The Project page's chat bar. A description makes a new Document; `@` offers the
 * Project's Documents and the Templates. A message naming a Document goes to that
 * Document's Session; one with a Template chip makes a new Document from it.
 */
function ChatBar({ documents }: { documents: DocumentInfo[] }) {
  const [text, setText] = useState('')
  const [template, setTemplate] = useState<TemplateInfo | null>(null)
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const mentions = useMentions({ id: 'chat-bar-mentions', text, setText, documents, onTemplate: setTemplate, field: input })

  function send() {
    const message = text.trim()
    if (!message || sending) return
    setSending(true)
    const sent = template ? host.call('project.newDocument', message, [], { template: template.id }) : host.call('project.send', message)
    sent
      .then(() => {
        setText('')
        setTemplate(null)
      })
      .catch(() => {})
      .finally(() => setSending(false))
  }

  return (
    <form
      className="relative mt-10 flex h-[52px] w-full max-w-[620px] items-center gap-0.5 rounded-full border border-line bg-white py-0 pr-2 pl-5 shadow-[0_2px_10px_-2px_rgba(0,0,0,.08)] transition focus-within:shadow-[0_4px_16px_-4px_rgba(0,0,0,.14)]"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      {template && (
        <span className="-ml-2.5 mr-1.5">
          <TemplateChip
            template={template}
            onRemove={() => {
              setTemplate(null)
              input.current?.focus()
            }}
          />
        </span>
      )}
      <input
        ref={input}
        className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14.5px] outline-0 placeholder:text-tx3"
        placeholder={template ? `Describe the ${template.name.toLowerCase()}…` : 'Describe a new page, or @ a file to change it…'}
        aria-label="Describe a new page"
        autoComplete="off"
        autoFocus
        value={text}
        {...mentions.fieldProps}
        onKeyDown={(event) => {
          if (mentions.onKeyDown(event)) return
          const { selectionStart, selectionEnd } = event.currentTarget
          if (event.key === 'Backspace' && template && selectionStart === 0 && selectionEnd === 0) setTemplate(null)
        }}
      />
      <button type="button" className="icon-btn rounded-full" title="Voice" aria-label="Voice">
        <MicIcon />
      </button>
      <button
        className="grid size-8 flex-none place-items-center rounded-full bg-primary text-white disabled:cursor-default disabled:bg-[#d4d4d8]"
        title="Start (↵)"
        aria-label="Start"
        disabled={!text.trim() || sending}
      >
        <ArrowUpIcon />
      </button>
      {mentions.popover && <div className="absolute top-[58px] left-3 z-20">{mentions.popover}</div>}
    </form>
  )
}

/** The row of Template cards between the chat bar and the Documents: each opens a dialog that makes a Document from it. */
function TemplateCards() {
  const [chosen, setChosen] = useState<TemplateInfo | null>(null)
  return (
    <>
      <ul aria-label="Templates" className="m-0 mt-6 flex w-full max-w-[620px] list-none gap-3 p-0">
        {TEMPLATES.map((template) => (
          <li key={template.id} className="min-w-0 flex-1">
            <button
              className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-white/75 p-2.5 text-left shadow-[0_1px_3px_rgba(0,0,0,.04)] transition hover:border-border hover:bg-white hover:shadow-[0_4px_14px_-6px_rgba(0,0,0,.14)]"
              onClick={() => setChosen(template)}
            >
              <span
                className={`grid h-11 w-14 flex-none place-items-center rounded-[10px] ${template.video ? 'bg-violet-soft text-violet-tx' : 'bg-muted text-tx2'}`}
              >
                <TemplateIcon template={template.id} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium">{template.name}</span>
                <small className="block truncate text-[12px] text-tx3">{template.description}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {chosen && <NewDocumentDialog template={chosen} onClose={() => setChosen(null)} />}
    </>
  )
}
