import { watch, type FSWatcher } from 'node:fs'
import type { DocumentList } from '@shared/host-api'
import { IGNORED_FOLDERS, listDocuments } from './documents'

const SETTLE_MS = 80

/**
 * Watches a Project folder and calls `onChange` with the new Documents list
 * whenever it differs from the last one (a file added, renamed, removed or
 * edited). Returns a function that stops watching.
 */
export function watchDocuments(projectDir: string, initial: DocumentList, onChange: (list: DocumentList) => void): () => void {
  let last = JSON.stringify(initial)
  let timer: NodeJS.Timeout | undefined
  let stopped = false
  let running: Promise<void> = Promise.resolve()

  const rescan = () => {
    timer = undefined
    running = running.then(async () => {
      if (stopped) return
      const list = await listDocuments(projectDir)
      const next = JSON.stringify(list)
      if (stopped || next === last) return
      last = next
      onChange(list)
    })
  }

  let watcher: FSWatcher | undefined
  try {
    watcher = watch(projectDir, { recursive: true }, (_type, filename) => {
      if (filename && filename.split(/[\\/]/).some((part) => IGNORED_FOLDERS.includes(part))) return
      clearTimeout(timer)
      timer = setTimeout(rescan, SETTLE_MS)
    })
    // A folder that disappears while open just stops updating.
    watcher.on('error', () => watcher?.close())
  } catch {
    watcher = undefined
  }

  return () => {
    stopped = true
    clearTimeout(timer)
    watcher?.close()
  }
}
