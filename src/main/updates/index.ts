import type { UpdateStatus } from '@shared/host-api'

// Auto-update from GitHub Releases. The release feed sits behind `UpdateSource`
// (electron-updater in the packaged app, a fake in tests), so the state
// machine here knows nothing about Electron or the platform.

export interface UpdateSource {
  /** Asks the feed for a release newer than the running app; null when there is none. */
  check(): Promise<{ version: string } | null>
  download(): Promise<void>
  /** Quits the app and starts the downloaded version. */
  install(): void
}

export interface Updater {
  status(): UpdateStatus
  check(): Promise<UpdateStatus>
  install(): void
}

export function createUpdater(source: UpdateSource | undefined, onChange: (status: UpdateStatus) => void): Updater {
  let status: UpdateStatus = source ? { state: 'idle' } : { state: 'unavailable' }
  let running: Promise<UpdateStatus> | undefined

  const set = (next: UpdateStatus) => {
    status = next
    onChange(next)
  }

  async function run(source: UpdateSource): Promise<UpdateStatus> {
    set({ state: 'checking' })
    try {
      const release = await source.check()
      if (!release) {
        set({ state: 'up-to-date' })
      } else {
        set({ state: 'downloading', version: release.version })
        await source.download()
        set({ state: 'ready', version: release.version })
      }
    } catch (error) {
      set({ state: 'failed', message: error instanceof Error ? error.message : String(error) })
    }
    return status
  }

  return {
    status: () => status,
    check() {
      if (!source || status.state === 'ready') return Promise.resolve(status)
      running ??= run(source).finally(() => (running = undefined))
      return running
    },
    install() {
      if (!source || status.state !== 'ready') throw new Error('No update is ready to install')
      source.install()
    },
  }
}
