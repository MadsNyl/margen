import type { UpdateStatus } from '@shared/host-api'
import { host, useHostValue } from '../host'
import { UpdateIcon } from './icons'

/**
 * Next to Settings: a red dot while a newer Margen is on its way or ready, a
 * green one otherwise. Click it to restart into a ready update, or to check again.
 */
export function UpdateButton() {
  const status = useHostValue('update.status', 'update.changed')
  const fresh = status?.state === 'downloading' || status?.state === 'ready'
  const label = status ? updateTitle(status) : 'Updates'
  return (
    <button
      className="icon-btn relative"
      title={label}
      aria-label={label}
      onClick={() => void (status?.state === 'ready' ? host.call('update.install') : host.call('update.check')).catch(() => {})}
    >
      <UpdateIcon />
      <span
        data-update={fresh ? 'new' : 'none'}
        aria-hidden
        className={`absolute top-[5px] right-[5px] size-[7px] rounded-full ring-2 ring-white ${fresh ? 'bg-[#e5484d]' : 'bg-mint-strong'}`}
      />
    </button>
  )
}

function updateTitle(status: UpdateStatus): string {
  switch (status.state) {
    case 'ready':
      return `Margen ${status.version} is ready: restart to update`
    case 'downloading':
      return `Downloading Margen ${status.version}`
    case 'checking':
      return 'Checking for updates'
    case 'failed':
      return 'Couldn’t check for updates. Click to try again'
    case 'unavailable':
      return 'Updates come with release builds'
    default:
      return 'Margen is up to date. Click to check again'
  }
}
