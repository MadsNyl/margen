import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AgentStatus } from '@shared/agent'
import type { PermissionPreset, UpdateStatus } from '@shared/host-api'
import { host, useHostValue } from '../host'
import { CloseIcon } from './icons'

const OpenSettings = createContext<() => void>(() => {})

/** Opens the Settings dialog: the gear on the Start and Project screens, and the Composer's preset badge. */
export function useOpenSettings() {
  return useContext(OpenSettings)
}

/** Holds whether Settings is open and shows the dialog over whatever screen is on. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <OpenSettings.Provider value={() => setOpen(true)}>
      {children}
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </OpenSettings.Provider>
  )
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  // Escape closes the dialog and does nothing else (it doesn't stop a Turn).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,17,17,.18)] backdrop-blur-[2px]"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="settings-title"
        className="modal-in max-h-[86%] w-[600px] overflow-auto rounded-[22px] bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,.35),0_0_0_1px_rgba(0,0,0,.06)]"
      >
        <div className="flex items-center px-[22px] pt-[18px] pb-1.5">
          <h2 id="settings-title" className="m-0 text-[18px] font-medium tracking-[-0.01em]">
            Settings
          </h2>
          <button className="icon-btn ml-auto" title="Close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <AgentSection />
        <PermissionsSection />
        <AboutSection />
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `settings-${title.toLowerCase()}`
  return (
    <section aria-labelledby={id} className="border-border px-[22px] pt-3.5 pb-[18px] not-first-of-type:border-t">
      <h3 id={id} className="m-0 mb-2.5 text-xs font-medium text-tx3">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({ title, detail, children }: { title: string; detail: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 py-1.5">
      <div className="min-w-0 flex-1">
        <b className="mb-0.5 block text-sm font-medium">{title}</b>
        <small className="text-[12.5px] leading-[1.45] text-tx2">{detail}</small>
      </div>
      {children}
    </div>
  )
}

const pill = 'inline-flex h-[26px] flex-none items-center gap-[7px] rounded-full bg-muted px-2.5 text-xs text-tx2'

function AgentSection() {
  const [status, setStatus] = useState<AgentStatus>()
  useEffect(() => {
    let live = true
    void host.call('agent.detect').then((result) => live && setStatus(result))
    return () => {
      live = false
    }
  }, [])

  return (
    <Section title="Agent">
      <Row title="Claude Code" detail={<span className="font-mono text-[11px]">{status ? agentDetail(status) : ' '}</span>}>
        {status && (
          <span role="status" aria-label="Claude Code" className={pill}>
            {status.installed && status.signedIn && (
              <span className="size-[7px] rounded-full bg-mint-strong shadow-[0_0_0_3px_var(--color-mint)]" />
            )}
            {status.installed ? (status.signedIn ? 'Ready' : 'Signed out') : 'Not found'}
          </span>
        )}
      </Row>
      <Row
        title="Codex"
        detail={
          <>
            Uses your own <span className="font-mono text-[11px]">codex login</span>.
          </>
        }
      >
        <span className="flex-none rounded-full bg-muted px-[9px] py-[3px] text-[11px] text-tx2">Coming in 1.1</span>
      </Row>
    </Section>
  )
}

/** `~/.local/bin/claude · v2.4.1 · signed in (Max)` */
function agentDetail(status: AgentStatus): string {
  if (!status.installed) return 'Not installed'
  return [
    status.path,
    status.version && `v${status.version}`,
    status.signedIn ? `signed in${status.plan ? ` (${status.plan})` : ''}` : 'signed out',
  ]
    .filter(Boolean)
    .join(' · ')
}

function PermissionsSection() {
  const preset = useHostValue('permissions.preset', 'permissions.changed')
  const choose = (next: PermissionPreset) => void host.call('permissions.setPreset', next)

  return (
    <Section title="Permissions">
      <div role="radiogroup" aria-label="Permission preset">
        <PresetOption
          checked={preset === 'editor'}
          onChoose={() => choose('editor')}
          title={
            <>
              Editor preset <small className="font-normal text-tx3">· recommended</small>
            </>
          }
          rules={[
            ['Auto', 'Read anything in the Project; write and edit its files'],
            ['Auto', 'Web search and fetch (images, fonts, references)'],
            ['Ask', 'Shell commands'],
            ['Ask', 'Anything outside the Project folder'],
          ]}
        />
        <PresetOption
          checked={preset === 'allow-everything'}
          onChoose={() => choose('allow-everything')}
          title="Allow everything"
          rules={[['Auto', 'Claude never asks. Checkpoints still let you undo any Turn.']]}
        />
      </div>
    </Section>
  )
}

function PresetOption(props: {
  checked: boolean
  onChoose: () => void
  title: ReactNode
  rules: ['Auto' | 'Ask', string][]
}) {
  return (
    <button
      role="radio"
      aria-checked={props.checked}
      onClick={props.onChoose}
      className={`mb-2 grid w-full grid-cols-[18px_1fr] gap-3 rounded-2xl border p-3.5 text-left ${props.checked ? 'border-[#d4d4d8] bg-muted' : 'border-border'}`}
    >
      <span
        className={`mt-0.5 size-4 rounded-full bg-white ${props.checked ? 'border-[5px] border-primary' : 'border-[1.5px] border-[#b4b4bc]'}`}
      />
      <span>
        <b className="font-medium">{props.title}</b>
        <ul className="m-0 mt-2 grid list-none gap-[5px] p-0">
          {props.rules.map(([when, what]) => (
            <li key={what} className="flex items-center gap-2.5 text-[12.5px] text-tx2">
              <i
                className={`w-11 flex-none rounded-full px-[7px] py-px text-center text-[10.5px] font-medium not-italic ${when === 'Auto' ? 'bg-mint text-[#185a36]' : 'bg-yellow text-[#7a5600]'}`}
              >
                {when}
              </i>
              {what}
            </li>
          ))}
        </ul>
      </span>
    </button>
  )
}

function AboutSection() {
  const [version, setVersion] = useState<string>()
  const update = useHostValue('update.status', 'update.changed')
  useEffect(() => {
    void host.call('app.version').then(setVersion)
  }, [])

  const ready = update?.state === 'ready'
  const busy = !update || ['unavailable', 'checking', 'downloading'].includes(update.state)
  return (
    <Section title="About">
      <Row
        title={`Margen ${version ?? ''}`}
        detail={
          <>
            Free and open source (MIT). Part of Margin.
            {update && updateLine(update) && <span className="block">{updateLine(update)}</span>}
          </>
        }
      >
        <button
          className="inline-flex h-9 flex-none items-center justify-center rounded-full border border-border bg-white px-3.5 text-[13.5px] font-medium transition hover:bg-muted disabled:cursor-default disabled:text-tx3 disabled:hover:bg-white"
          disabled={!ready && busy}
          title={update?.state === 'unavailable' ? 'Updates come with release builds' : undefined}
          onClick={() => void (ready ? host.call('update.install') : host.call('update.check'))}
        >
          {ready ? 'Restart to update' : 'Check for updates'}
        </button>
      </Row>
    </Section>
  )
}

function updateLine(status: UpdateStatus): string | undefined {
  switch (status.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'up-to-date':
      return 'Margen is up to date.'
    case 'downloading':
      return `Downloading version ${status.version}…`
    case 'ready':
      return `Version ${status.version} is ready.`
    case 'failed':
      return 'Couldn’t check for updates. Try again later.'
    default:
      return undefined
  }
}
