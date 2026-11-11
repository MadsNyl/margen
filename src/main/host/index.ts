import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { HostApi, HostCallName, HostCalls, HostEventName, HostEvents, OpenDocument, Project } from '@shared/host-api'
import type { AgentProvider } from '../agent/provider'
import { openCheckpoints, type CheckpointStore } from '../checkpoints'
import { presetPolicy } from '../permissions'
import { createPresetStore, isPreset } from '../permissions/preset'
import type { DocumentSession } from '../sessions'
import { documentSessions, type DocumentSessions } from '../sessions/document'
import { openSessionStore } from '../sessions/store'
import { locateAnnotations } from '../turns'
import { createModelChoiceStore, isModelChoice } from '../turns/model'
import { createUpdater, type UpdateSource } from '../updates'
import { documentFile, documentUrl, resolveDocumentUrl, watchDocument, type DocumentFile } from '../projects/document'
import { listDocuments } from '../projects/documents'
import { makeDocumentFile, mentionedDocument } from '../projects/new-document'
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
  /** The running app's version (Electron's `app.getVersion()`). */
  version?: string
  /** Screenshots the Document view (a PNG data URL), or `null`. Left out in tests. */
  captureDocument?: () => Promise<string | null>
}

export interface Host extends HostApi {
  /** The file a `margen-doc://` request may serve: inside the current Project, else `null`. Used by the protocol handler. */
  resolveDocumentUrl(url: string): Promise<DocumentFile | null>
  /** A link the Document view followed: emits `document.link` when it leads to a Document of the current Project. */
  followLink(url: string): Promise<void>
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
  version = '0.0.0',
  captureDocument = async () => null,
}: HostDeps): Host {
  const events = createEmitter<HostEvents>()
  const updater = createUpdater(updates, (status) => events.emit('update.changed', status))
  let current: Project | null = null
  let stopWatching = () => {}
  let document: OpenDocument | null = null
  let stopWatchingDocument = () => {}
  let session: DocumentSession | null = null
  let sessions: DocumentSessions | null = null
  let checkpoints: CheckpointStore | null = null
  const preset = createPresetStore(dataDir)
  const modelChoice = createModelChoiceStore(dataDir)

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
    sessions = documentSessions({
      store: openSessionStore(dataDir, project.path),
      agent,
      projectDir: project.path,
      document: path,
      permissions: presetPolicy(project.path, preset.get),
      beforeTurn: async (turn) => {
        const store = checkpoints
        if (!store) return undefined
        const number = session?.view().number
        const checkpoint = await store.take({ reason: 'turn', document: path, ...(number && { session: number }), text: turn.text })
        if (store === checkpoints) events.emit('checkpoints.changed', await store.list())
        return checkpoint.id
      },
      onEntry: (id, entry, index) => events.emit('session.entry', { document: path, session: id, index, entry }),
      onQueue: (queue) => events.emit('session.queue', queue),
      onChanged: (next) => {
        session = next
        events.emit('session.changed', next.view())
        events.emit('session.queue', next.queue())
      },
    })
    session = sessions.current()
    events.emit('document.opened', document)
    return document
  }

  function closeDocument() {
    stopWatchingDocument()
    stopWatchingDocument = () => {}
    sessions?.dispose()
    sessions = null
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
    'agent.cancelSignIn': async () => agent.cancelSignIn(),
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
    'document.capture': async () => (document ? captureDocument() : null),
    'session.current': async () => session?.view() ?? null,
    'session.send': async (turn) => {
      const target = session
      if (!target || !current || !document) throw new Error('No Document is open')
      const source = turn.annotations.length ? await readFile(join(current.path, document.path), 'utf8').catch(() => undefined) : undefined
      if (target !== session) throw new Error('The Document was closed')
      await target.send(locateAnnotations(turn, source))
    },
    'session.running': async () => session?.running() ?? false,
    'session.queue': async () => session?.queue() ?? null,
    'session.unqueue': async (id) => session?.unqueue(id),
    'session.interrupt': async () => session?.interrupt(),
    'session.answerApproval': async (id, decision) => session?.answerApproval(id, decision),
    'session.new': async () => {
      if (!sessions) throw new Error('No Document is open')
      return sessions.startNew().view()
    },
    'session.resume': async (id) => {
      if (!sessions) throw new Error('No Document is open')
      return sessions.resume(id).view()
    },
    'sessions.list': async () => sessions?.list() ?? [],
    'checkpoints.list': async () => (checkpoints ? checkpoints.list() : []),
    'checkpoints.revert': async (id) => {
      const store = checkpoints
      if (!store) throw new Error('No Project is open')
      if (session?.running()) throw new Error('A Turn is running')
      await store.revert(id)
      if (store === checkpoints) events.emit('checkpoints.changed', await store.list())
    },
    'project.send': async (text) => {
      if (!current) throw new Error('No Project is open')
      const { documents } = await listDocuments(current.path)
      const path =
        mentionedDocument(
          text,
          documents.map((doc) => doc.path),
        ) ?? (await makeDocumentFile(current.path, text))
      const opened = await openDocument(path)
      await session?.send({ text, annotations: [] })
      return opened
    },
    'model.choice': () => modelChoice.get(),
    'model.setChoice': async (choice) => {
      if (!isModelChoice(choice)) throw new Error(`Not a model choice: ${JSON.stringify(choice)}`)
      const kept = { ...(choice.model && { model: choice.model }), ...(choice.effort && { effort: choice.effort }) }
      await modelChoice.set(kept)
      events.emit('model.changed', kept)
      return kept
    },
    'permissions.preset': () => preset.get(),
    'permissions.setPreset': async (next) => {
      if (!isPreset(next)) throw new Error(`Not a permission preset: ${String(next)}`)
      await preset.set(next)
      events.emit('permissions.changed', next)
      if (next === 'allow-everything') session?.allowWaiting()
      return next
    },
    'recents.list': () => listRecents(dataDir),
    'recents.clear': async () => {
      await clearRecents(dataDir)
      events.emit('recents.changed', [])
    },
    'app.version': async () => version,
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
    async followLink(url) {
      const project = current
      const file = project && resolveDocumentUrl(project.path, url)
      if (!project || !file) return
      const path = relative(project.path, file).split(sep).join('/')
      const { documents } = await listDocuments(project.path)
      if (project === current && documents.some((doc) => doc.path === path)) events.emit('document.link', { path })
    },
    dispose() {
      close()
      events.clear()
    },
  }
}
