import type { ReactNode } from 'react'
import { Brand } from '../components/Brand'
import { FolderIcon, PlusIcon, SettingsIcon } from '../components/icons'
import { host, useHostValue } from '../host'

export function StartScreen() {
  const recents = useHostValue('recents.list', 'recents.changed')

  return (
    <main className="relative mx-2 mb-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-card">
      <div className="grain-banner" aria-hidden />
      <header className="relative z-10 flex h-12 flex-none items-center justify-between px-3">
        <Brand />
        <button className="icon-btn" title="Settings" aria-label="Settings">
          <SettingsIcon />
        </button>
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
            >
              Any folder: a website's code, a folder of HTML files, a brand kit. Claude can read all of it.
            </Choice>
            <Choice
              art={<PlusIcon />}
              artClass="bg-[#efedff] text-[#3b2fa8]"
              title="New project"
              shortcut="⌘N"
              hint="Name it, then describe what to make"
            >
              An empty folder in <span className="font-mono text-[11.5px]">~/Documents/Margen</span>, ready for its
              first page.
            </Choice>
          </div>

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
                  <li key={project.path}>
                    <button className="flex w-full min-w-0 items-center gap-4 rounded-[14px] p-2 text-left transition hover:bg-muted/80">
                      <span className="size-16 flex-none rounded-[14px] bg-muted" aria-hidden />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <b className="truncate text-sm font-normal">{project.name}</b>
                        <small className="truncate font-mono text-[10.5px] text-tx3">{project.path}</small>
                      </span>
                    </button>
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

function Choice(props: {
  art: ReactNode
  artClass: string
  title: string
  shortcut: string
  hint: string
  children: ReactNode
}) {
  return (
    <button className="relative flex min-h-[190px] flex-col gap-3.5 rounded-[22px] border border-line bg-card p-[22px] text-left shadow-[0_2px_10px_-2px_rgba(0,0,0,.06)] transition duration-200 hover:-translate-y-px hover:shadow-[0_12px_32px_-10px_rgba(0,0,0,.16)]">
      <span className={`grid size-12 place-items-center rounded-[14px] ${props.artClass}`}>{props.art}</span>
      <span>
        <h3 className="m-0 text-[17px] font-medium tracking-[-0.01em]">{props.title}</h3>
        <p className="mt-1 mb-0 text-[13px] leading-normal text-tx2">{props.children}</p>
      </span>
      <span className="mt-auto text-xs text-tx3">{props.hint}</span>
      <kbd className="absolute top-[22px] right-[22px]">{props.shortcut}</kbd>
    </button>
  )
}
