import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell, type WebContents } from 'electron'
import { DOCUMENT_PARTITION } from '@shared/document-bridge'
import type { HostEventName } from '@shared/host-api'
import { chooseAgentProvider } from './agent'
import { createElectronUpdateSource } from './auto-update'
import { createHost, type Host } from './host'
import { bindHostToIpc } from './ipc'
import { DOCUMENT_SCHEME } from './projects/document'

// Electron bootstrap only: windows, security settings and wiring the host API
// to IPC. Domain logic lives in framework-free modules behind `createHost`.

const FORWARDED_EVENTS: HostEventName[] = [
  'recents.changed',
  'projects.changed',
  'documents.changed',
  'document.opened',
  'document.updated',
  'session.entry',
  'session.queue',
  'session.changed',
  'update.changed',
]

const FIRST_UPDATE_CHECK_MS = 10_000
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

if (process.env.MARGEN_DATA_DIR) app.setPath('userData', process.env.MARGEN_DATA_DIR)

// margen-doc://<project id>/<path> serves the open Project's files to the Document view,
// as a standard, secure origin per Project (so the page's localStorage works).
protocol.registerSchemesAsPrivileged([
  { scheme: DOCUMENT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

/** The native folder picker. `MARGEN_PICK_FOLDER=<path>` stands in for it in Seam 2 tests. */
async function pickFolder(): Promise<string | undefined> {
  if (process.env.MARGEN_PICK_FOLDER) return process.env.MARGEN_PICK_FOLDER
  const window = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Open' }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  return result.canceled ? undefined : result.filePaths[0]
}

/** The Document view's session: serves margen-doc:// from the open Project and grants the page no permissions. */
function serveDocuments(host: Host) {
  const documents = session.fromPartition(DOCUMENT_PARTITION)
  documents.protocol.handle(DOCUMENT_SCHEME, async (request) => {
    const served = await host.resolveDocumentUrl(request.url)
    if (!served) return new Response('Not found', { status: 404 })
    const response = await net.fetch(pathToFileURL(served.file).href).catch(() => new Response('Not found', { status: 404 }))
    if (!served.contentType || !response.ok) return response
    return new Response(response.body, { status: response.status, headers: { 'content-type': served.contentType } })
  })
  documents.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
}

/**
 * The Document view: links to the web open in the browser, links to another
 * Document of the Project open it in the editor, and the view never leaves the Project.
 */
function guardDocumentView(host: Host, contents: WebContents) {
  const leave = (url: string) => {
    if (/^https?:/i.test(url)) {
      void shell.openExternal(url)
      return
    }
    void Promise.all([host.call('projects.current'), host.resolveDocumentUrl(url)]).then(([project, served]) => {
      if (project && served) void host.call('document.open', relative(project.path, served.file).split(sep).join('/')).catch(() => {})
    })
  }
  contents.setWindowOpenHandler(({ url }) => {
    leave(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event) => {
    event.preventDefault()
    leave(event.url)
  })
}

function createWindow(host: Host): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Margen',
    backgroundColor: '#fafafa',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  })
  // The only <webview> allowed is the Document view: its partition, a margen-doc:// page,
  // Margen's own script as its preload, and no Node, whatever the renderer asked for.
  window.webContents.on('will-attach-webview', (event, preferences, params) => {
    if (params.partition !== DOCUMENT_PARTITION || !params.src?.startsWith(`${DOCUMENT_SCHEME}://`)) return event.preventDefault()
    preferences.preload = join(__dirname, '../preload/document.js')
    preferences.sandbox = true
    preferences.contextIsolation = true
    preferences.nodeIntegration = false
    preferences.nodeIntegrationInSubFrames = false
    preferences.webSecurity = true
  })
  window.webContents.on('did-attach-webview', (_event, contents) => guardDocumentView(host, contents))
  window.once('ready-to-show', () => window.show())
  // Links leave the app for the user's browser; the app window never navigates away.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
  return window
}

void app.whenReady().then(() => {
  // Only a packaged build has a release feed; dev runs and tests get no updates.
  const updates = app.isPackaged ? createElectronUpdateSource(process.env) : undefined
  const host = createHost({
    dataDir: app.getPath('userData'),
    agent: chooseAgentProvider(process.env),
    updates,
    pickFolder,
    openExternal: (url) => shell.openExternal(url),
    // `MARGEN_PROJECTS_DIR` stands in for ~/Documents/Margen in Seam 2 tests.
    projectsDir: process.env.MARGEN_PROJECTS_DIR ?? join(app.getPath('documents'), 'Margen'),
  })
  serveDocuments(host)
  bindHostToIpc(host, ipcMain, () => BrowserWindow.getAllWindows(), FORWARDED_EVENTS)
  if (updates) {
    const check = () => void host.call('update.check')
    setTimeout(check, FIRST_UPDATE_CHECK_MS)
    setInterval(check, UPDATE_CHECK_INTERVAL_MS)
  }
  createWindow(host)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(host)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
