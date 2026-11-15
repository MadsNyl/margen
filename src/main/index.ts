import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell, type WebContents } from 'electron'
import { DOCUMENT_PARTITION } from '@shared/document-bridge'
import type { HostEventName } from '@shared/host-api'
import { chooseAgentProvider } from './agent'
import { createElectronUpdateSource } from './auto-update'
import { createHost, type Host } from './host'
import { bindHostToIpc } from './ipc'
import { DOCUMENT_SCHEME } from './projects/document'
import { openVideoFrames } from './video-frames'
import { printPdf } from './print-pdf'
import { VIDEOTOOLBOX_H264 } from './video/videotoolbox'
import { createUtilityProcessSynthesiser } from './voice-process'
import { fakeVoicesFromScript } from './voices/fake'

// Electron bootstrap only: windows, security settings and wiring the host API
// to IPC. Domain logic lives in framework-free modules behind `createHost`.

const FORWARDED_EVENTS: HostEventName[] = [
  'recents.changed',
  'projects.changed',
  'documents.changed',
  'document.opened',
  'document.updated',
  'document.link',
  'session.entry',
  'permissions.changed',
  'model.changed',
  'session.queue',
  'session.changed',
  'checkpoints.changed',
  'update.changed',
  'voices.changed',
  'video.exportProgress',
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

/** The native file picker for attachments. `MARGEN_PICK_FILES=<JSON list of paths>` stands in for it in Seam 2 tests. */
async function pickFiles(): Promise<string[]> {
  if (process.env.MARGEN_PICK_FILES) return JSON.parse(process.env.MARGEN_PICK_FILES) as string[]
  const window = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = { properties: ['openFile', 'multiSelections'], buttonLabel: 'Attach' }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

/** What an export's Save dialog offers, by the extension of the file it suggests. */
const SAVE_FILTERS: Record<string, Electron.FileFilter> = {
  '.mp4': { name: 'MPEG-4 video', extensions: ['mp4'] },
  '.pdf': { name: 'PDF', extensions: ['pdf'] },
}

/** The Save dialog for an export. `MARGEN_SAVE_FILE=<path>` stands in for it in Seam 2 tests. */
async function pickSaveFile(defaultPath: string): Promise<string | undefined> {
  if (process.env.MARGEN_SAVE_FILE) return process.env.MARGEN_SAVE_FILE
  const window = BrowserWindow.getFocusedWindow()
  const filter = SAVE_FILTERS[extname(defaultPath)]
  const options: Electron.SaveDialogOptions = { defaultPath, buttonLabel: 'Export', filters: filter ? [filter] : [] }
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
  return result.canceled ? undefined : result.filePath
}

/** The platform's H.264 encoder for an export: VideoToolbox on the Mac, none (no export) elsewhere yet. */
const videoEncoder = () => (process.platform === 'darwin' ? { encoder: VIDEOTOOLBOX_H264 } : {})

/** The ffmpeg `build/ffmpeg.mjs` builds: shipped in the app's Resources, from vendor/ in dev and tests. */
const ffmpegPath = () =>
  app.isPackaged ? join(process.resourcesPath, 'ffmpeg', 'ffmpeg') : join(__dirname, '../../vendor/ffmpeg', process.arch, 'ffmpeg')

/** Only http(s) links are handed to the browser: `shell.openExternal` would also open files and other apps' schemes. */
const isWebUrl = (url: string) => /^https?:/i.test(url)

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
 * Document of the Project go to the editor to open, and the view never leaves the Project.
 */
function guardDocumentView(host: Host, contents: WebContents) {
  const leave = (url: string) => {
    if (isWebUrl(url)) void shell.openExternal(url)
    else void host.followLink(url)
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

/** The Document view's page, once the editor has attached it. */
let documentView: WebContents | undefined
const CAPTURE_TIMEOUT_MS = 3000

/** Screenshots the Document view. `capturePage` hangs while the window is hidden, so it gives up after a while. */
async function captureDocument(): Promise<string | null> {
  const view = documentView
  if (!view || view.isDestroyed()) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS)))
  try {
    const image = await Promise.race([view.capturePage(), timeout])
    return image && !image.isEmpty() ? image.toDataURL() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
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
  window.webContents.on('did-attach-webview', (_event, contents) => {
    documentView = contents
    guardDocumentView(host, contents)
  })
  window.once('ready-to-show', () => window.show())
  // Web links leave the app for the user's browser; the app window never navigates away.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
  return window
}

void app.whenReady().then(() => {
  // A packaged build has its icon in the bundle; a dev run would show Electron's.
  if (!app.isPackaged) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  // Only a packaged build has a release feed; dev runs and tests get no updates.
  const updates = app.isPackaged ? createElectronUpdateSource(process.env) : undefined
  const host = createHost({
    dataDir: app.getPath('userData'),
    agent: chooseAgentProvider(process.env),
    updates,
    pickFolder,
    pickFiles,
    pickSaveFile,
    printPdf,
    video: { ffmpeg: ffmpegPath(), ...videoEncoder(), frames: (url) => openVideoFrames(url, join(__dirname, '../preload/document.js')) },
    openExternal: (url) => shell.openExternal(url),
    showFolder: async (path) => {
      const error = await shell.openPath(path)
      if (error) throw new Error(error)
    },
    captureDocument,
    // `MARGEN_FAKE_VOICES` stands in for sherpa-onnx's releases and the synthesiser in Seam 2 tests.
    voices: process.env.MARGEN_FAKE_VOICES
      ? fakeVoicesFromScript(process.env.MARGEN_FAKE_VOICES)
      : { synthesiser: createUtilityProcessSynthesiser(join(__dirname, 'voice-worker.js')) },
    // `MARGEN_PROJECTS_DIR` stands in for ~/Margen in Seam 2 tests.
    projectsDir: process.env.MARGEN_PROJECTS_DIR ?? join(app.getPath('home'), 'Margen'),
    // Unpackaged (dev, Seam 2) `getVersion()` is Electron's own, so read Margen's package.json.
    version: app.isPackaged ? app.getVersion() : JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')).version,
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
