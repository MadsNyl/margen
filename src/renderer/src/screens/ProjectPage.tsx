import { useEffect, useState } from 'react'
import type { DocumentList, Project } from '@shared/host-api'
import { Brand } from '../components/Brand'
import { ItemRow } from '../components/Cover'
import { Menu, MenuHeading, MenuItem, useDropdown } from '../components/Menu'
import { ArrowUpIcon, HtmlFileIcon, MicIcon, SettingsIcon, SmallFolderIcon } from '../components/icons'
import { editedAgo, joinList, plural } from '../format'
import { host, useHostValue } from '../host'

export function ProjectPage({ project }: { project: Project }) {
  const list = useHostValue('documents.list', 'documents.changed')

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
        <button className="icon-btn" title="Settings" aria-label="Settings">
          <SettingsIcon />
        </button>
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-6 pt-7">
          <ProjectSwitcher project={project} />
          <BuildTitle />
          <ChatBar />
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
        <FilesHeader title="HTML files" note={project.path} />
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
        title={plural(documents.length, 'HTML file')}
        note={hidden.length ? `${joinList(hidden)} ${hidden.length === 1 ? 'is' : 'are'} hidden` : project.path}
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

function FilesHeader({ title, note }: { title: string; note: string }) {
  return (
    <div className="mx-2 mb-2.5 flex items-baseline justify-between gap-4">
      <h2 className="m-0 text-[13px] font-medium text-tx2">{title}</h2>
      <small className="truncate text-xs text-tx3">{note}</small>
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
        <span className="text-[10px] text-tx3">▼</span>
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

/** The Project page's chat bar. It renders now; ticket 15 makes it create and change Documents. */
function ChatBar() {
  return (
    <form
      className="relative mt-10 flex h-[52px] w-full max-w-[620px] items-center gap-0.5 rounded-full border border-line bg-white py-0 pr-2 pl-5 shadow-[0_2px_10px_-2px_rgba(0,0,0,.08)] transition focus-within:shadow-[0_4px_16px_-4px_rgba(0,0,0,.14)]"
      onSubmit={(event) => event.preventDefault()}
    >
      <input
        className="h-full flex-1 border-0 bg-transparent text-[14.5px] outline-0 placeholder:text-tx3"
        placeholder="Describe a new page, or @ a file to change it…"
        aria-label="Describe a new page"
        autoComplete="off"
      />
      <button type="button" className="icon-btn rounded-full" title="Voice" aria-label="Voice">
        <MicIcon />
      </button>
      <button
        className="grid size-8 flex-none place-items-center rounded-full bg-primary text-white disabled:cursor-default disabled:bg-[#d4d4d8]"
        title="Start (↵)"
        aria-label="Start"
        disabled
      >
        <ArrowUpIcon />
      </button>
    </form>
  )
}
