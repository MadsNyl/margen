import { useState, type FormEvent, type ReactNode } from 'react'
import { Brand } from '../components/Brand'
import { ItemRow } from '../components/Cover'
import { Dialog } from '../components/Dialog'
import { useOpenSettings } from '../components/Settings'
import { UpdateButton } from '../components/UpdateButton'
import { ArrowRightIcon, FolderIcon, PlusIcon, SettingsIcon, SmallFolderIcon } from '../components/icons'
import { plural } from '../format'
import { host, useHostValue } from '../host'

/** `naming` shows the New project dialog; ⌘N in the app root turns it on. */
export function StartScreen({ naming, onNaming }: { naming: boolean; onNaming: (naming: boolean) => void }) {
  const recents = useHostValue('recents.list', 'recents.changed')
  const openSettings = useOpenSettings()

  return (
    <main className="relative mx-2 mb-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-card">
      <div className="grain-banner" aria-hidden />
      <header className="relative z-10 flex h-12 flex-none items-center justify-between px-3">
        <Brand />
        <span className="flex items-center gap-0.5">
          <UpdateButton />
          <button className="icon-btn" title="Settings" aria-label="Settings" onClick={openSettings}>
            <SettingsIcon />
          </button>
        </span>
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-6 pt-14 pb-16">
          <h1 className="m-0 text-center text-[44px] leading-[1.15] font-light tracking-[-0.025em]">
            Open a project,
            <br />
            or start a new one
          </h1>

          <div className="mt-11 grid w-[min(760px,100%)] grid-cols-2 gap-4">
            <Choice
              art={<FolderIcon />}
              artClass="bg-[#fff6d6] text-[#7a5600]"
              title="Open a folder"
              shortcut="⌘O"
              hint="Margen lists every HTML file inside it"
              onClick={() => void host.call('projects.choose')}
            >
              Any folder: a website's code, a folder of HTML files, a brand kit. Claude can read all of it.
            </Choice>
            <Choice
              art={<PlusIcon />}
              artClass="bg-[#efedff] text-[#3b2fa8]"
              title="New project"
              shortcut="⌘N"
              hint="Name it, then describe what to make"
              onClick={() => onNaming(true)}
            >
              An empty folder in <span className="font-mono text-[11.5px]">~/Documents/Margen</span>, ready for its
              first page.
            </Choice>
          </div>
          {naming && <NewProjectDialog onClose={() => onNaming(false)} />}

          <div className="mt-13 mb-1.5 flex w-[min(760px,100%)] items-baseline justify-between">
            <h2 className="m-0 text-[13px] font-medium text-tx2">Recent</h2>
            {recents && recents.length > 0 && (
              <button className="text-[12.5px] text-tx3 hover:text-tx2" onClick={() => void host.call('recents.clear')}>
                Clear
              </button>
            )}
          </div>
          <div className="w-[min(760px,100%)]">
            {recents?.length === 0 && <p className="px-2 py-3 text-[13px] text-tx3">No recent projects yet</p>}
            {recents && recents.length > 0 && (
              <ul aria-label="Recent projects" className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-2 p-0">
                {recents.map((project) => (
                  <li key={project.path} className="min-w-0">
                    <ItemRow
                      coverId={project.name}
                      badge={<SmallFolderIcon />}
                      name={project.name}
                      meta={`${project.missing ? 'Folder not found' : plural(project.htmlFiles, 'HTML file')} · ${project.path}`}
                      disabled={project.missing}
                      onClick={() => void host.call('projects.open', project.path).catch(() => {})}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

/** A card on the Start screen. */
function Choice(props: {
  art: ReactNode
  artClass: string
  title: string
  shortcut: string
  hint: string
  children: ReactNode
  onClick: () => void
}) {
  const content = (
    <>
      <span className={`grid size-12 place-items-center rounded-[14px] ${props.artClass}`}>{props.art}</span>
      <span>
        <h3 className="m-0 text-[17px] font-medium tracking-[-0.01em]">{props.title}</h3>
        <p className="mt-1 mb-0 text-[13px] leading-normal text-tx2">{props.children}</p>
      </span>
      <span className="mt-auto text-xs text-tx3">{props.hint}</span>
      <kbd className="absolute top-[22px] right-[22px]">{props.shortcut}</kbd>
    </>
  )
  return (
    <button
      onClick={props.onClick}
      className="relative flex min-h-[190px] flex-col gap-3.5 rounded-[22px] border border-line bg-card p-[22px] text-left shadow-[0_2px_10px_-2px_rgba(0,0,0,.06)] transition duration-200 hover:-translate-y-px hover:shadow-[0_12px_32px_-10px_rgba(0,0,0,.16)]"
    >
      {content}
    </button>
  )
}

/** New project: name the folder. Enter or the arrow makes the Project and opens it; Escape cancels. */
function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const create = (event: FormEvent) => {
    event.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    setError(undefined)
    // On success `projects.changed` swaps this screen for the Project page.
    host.call('projects.create', name).catch(() => {
      setBusy(false)
      setError('Couldn’t make the folder. Try another name.')
    })
  }

  return (
    <Dialog label="New project" onClose={onClose} className="w-[480px]">
      <form className="flex h-[60px] items-center gap-1.5 py-0 pr-3 pl-5" onSubmit={create}>
        <input
          autoFocus
          className="min-w-0 flex-1 border-0 bg-transparent text-[15px] outline-0 placeholder:text-tx3"
          placeholder="Name the new project"
          aria-label="Project name"
          autoComplete="off"
          spellCheck={false}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          className="grid size-8 flex-none place-items-center rounded-full bg-primary text-white transition hover:bg-primary-h disabled:cursor-default disabled:bg-[#d4d4d8]"
          title="Create (↵)"
          aria-label="Create"
          disabled={busy || !name.trim()}
        >
          <ArrowRightIcon />
        </button>
      </form>
      <p className="m-0 border-t border-line px-5 py-2.5 text-[12px] text-tx3">
        {error ?? (
          <>
            A new folder in <span className="font-mono text-[11px]">~/Documents/Margen</span>
          </>
        )}
      </p>
    </Dialog>
  )
}
