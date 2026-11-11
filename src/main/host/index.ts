import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { HostApi, HostCallName, HostCalls, HostEventName, HostEvents, OpenDocument, Project } from '@shared/host-api'
import type { AgentProvider } from '../agent/provider'
import { openCheckpoints, type CheckpointStore } from '../checkpoints'
import { projectPolicy } from '../permissions'
import { startDocumentSession, type DocumentSession } from '../sessions'
import { createUpdater, type UpdateSource } from '../updates'
import { documentFile, documentUrl, resolveDocumentUrl, watchDocument, type DocumentFile } from '../projects/document'
import { listDocuments } from '../projects/documents'
import { makeProjectFolder } from '../projects/new-project'
import { clearRecents, isFolder, listRecents, recordOpened } from '../projects/recents'
import { watchDocuments } from '../projects/watch'
import { createEmitter } from './emitter'

export interface HostDeps {
  /** Margen's own data directory (Electron's userData in the app, a temp folder in tests). */
  dataDir: string
  agent: AgentProvider
  /** The release feed for auto-update; left out in dev builds and tests. */
  updates?: UpdateSource
  /** The native folder picker; resolves `undefined` when cancelled. Tests and e2e pass their own. */
  pickFolder?: () => Promise<string | undefined>
  /** Opens a URL in the user's default browser (Electron's `shell.openExternal` in the app). */
  openExternal?: (url: string) => Promise<void>
  /** Where new Projects are made: `~/Documents/Margen` unless tests pass their own. */
  projectsDir?: string
}

export interface Host extends HostApi {
  /** The file a `margen-doc://` request may serve: inside the current Project, else `null`. Used by the protocol handler. */
  resolveDocumentUrl(url: string): Promise<DocumentFile | null>
  dispose(): void
}

type Handlers = { [K in HostCallName]: (...args: Parameters<HostCalls[K]>) => Promise<Awaited<ReturnType<HostCalls[K]>>> }

export function createHost({
  dataDir,
  agent,
  updates,
  pickFolder = async () => undefined,
  openExternal = async () => {},
  projectsDir = join(homedir(), 'Documents', 'Margen'),
}: HostDeps): Host {
  const events = createEmitter<HostEvents>()
  const updater = createUpdater(updates, (status) => events.emit('update.changed', status))
  let current: Project | null = null
  let stopWatching = () => {}
  let document: OpenDocument | null = null
  let stopWatchingDocument = () => {}
  let session: DocumentSession | null = null
  let checkpoints: CheckpointStore | null = null

  async function open(folder: string): Promise<Project> {
    const path = resolve(folder)
    if (!(await isFolder(path))) throw new Error(`Folder not found: ${path}`)
    close()
    current = { path, name: basename(path) }
    checkpoints = openCheckpoints(dataDir, path)
    stopWatching = watchDocuments(path, await listDocuments(path), (list) => events.emit('documents.changed', list))
    events.emit('projects.changed', current)
    await recordOpened(dataDir, current)
    events.emit('recents.changed', await listRecents(dataDir))
    return current
  }

  async function openDocument(path: string): Promise<OpenDocument> {
    const project = current
    const info = project && (await listDocuments(project.path)).documents.find((doc) => doc.path === path)
    if (!project || !info) throw new Error(`Not a Document of the open Project: ${path}`)
    closeDocument()
    document = { path, name: info.name, url: documentUrl(project.path, path) }
    stopWatchingDocument = watchDocument(project.path, path, () => events.emit('document.updated', { path }))
    session = startDocumentSession({
      agent,
      projectDir: project.path,
      document: path,
      permissions: projectPolicy(project.path),
      beforeTurn: async (turn) => {
        const store = checkpoints
        if (!store) return undefined
        const checkpoint = await store.take({ reason: 'turn', document: path, text: turn.text })
        if (store === checkpoints) events.emit('checkpoints.changed', await store.list())
        return checkpoint.id
      },
      onEntry: (entry, index) => events.emit('session.entry', { document: path, index, entry }),
    })
    events.emit('document.opened', document)
    return document
  }

  function closeDocument() {
    stopWatchingDocument()
    stopWatchingDocument = () => {}
    session?.dispose()
    session = null
    if (!document) return
    document = null
    events.emit('document.opened', null)
  }

  function close() {
    closeDocument()
    stopWatching()
    stopWatching = () => {}
    current = null
    checkpoints = null
  }

  const handlers: Handlers = {
    'agent.detect': () => agent.detect(),
    'agent.install': () => agent.install(),
    'agent.signIn': () => agent.signIn(),
    'projects.choose': async () => {
      const folder = await pickFolder()
      return folder ? open(folder) : null
    },
    'projects.open': open,
    'projects.create': async (name) => open(await makeProjectFolder(projectsDir, name)),
    'projects.current': async () => current,
    'projects.close': async () => {
      close()
      events.emit('projects.changed', null)
    },
    'documents.list': async () => (current ? listDocuments(current.path) : { documents: [], hidden: [] }),
    'document.open': openDocument,
    'document.current': async () => document,
    'document.close': async () => closeDocument(),
    'document.openInBrowser': async () => {
      if (current && document) await openExternal(pathToFileURL(join(current.path, document.path)).href)
    },
    'session.current': async () => session?.view() ?? null,
    'session.send': async (turn) => {
      if (!session) throw new Error('No Document is open')
      await session.send(turn)
    },
    'session.answerApproval': async (id, decision) => session?.answerApproval(id, decision),
    'checkpoints.list': async () => (checkpoints ? checkpoints.list() : []),
    'checkpoints.revert': async (id) => {
      const store = checkpoints
      if (!store) throw new Error('No Project is open')
      if (session?.running()) throw new Error('A Turn is running')
      await store.revert(id)
      if (store === checkpoints) events.emit('checkpoints.changed', await store.list())
    },
    'recents.list': () => listRecents(dataDir),
    'recents.clear': async () => {
      await clearRecents(dataDir)
      events.emit('recents.changed', [])
    },
    'update.status': async () => updater.status(),
    'update.check': () => updater.check(),
    'update.install': async () => updater.install(),
  }

  return {
    call(name, ...args) {
      if (!Object.hasOwn(handlers, name)) return Promise.reject(new Error(`Unknown host call: ${String(name)}`))
      const handler = handlers[name] as (...a: unknown[]) => Promise<never>
      return handler(...args)
    },
    on<K extends HostEventName>(event: K, listener: (payload: HostEvents[K]) => void) {
      return events.on(event, listener)
    },
    async resolveDocumentUrl(url) {
      const file = current && resolveDocumentUrl(current.path, url)
      return file ? documentFile(file) : null
    },
    dispose() {
      close()
      events.clear()
    },
  }
}
