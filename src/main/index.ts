import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { HostEventName } from '@shared/host-api'
import { chooseAgentProvider } from './agent'
import { createElectronUpdateSource } from './auto-update'
import { createHost } from './host'
import { bindHostToIpc } from './ipc'

// Electron bootstrap only: windows, security settings and wiring the host API
// to IPC. Domain logic lives in framework-free modules behind `createHost`.

const FORWARDED_EVENTS: HostEventName[] = ['recents.changed', 'projects.changed', 'documents.changed', 'update.changed']

const FIRST_UPDATE_CHECK_MS = 10_000
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

if (process.env.MARGEN_DATA_DIR) app.setPath('userData', process.env.MARGEN_DATA_DIR)

/** The native folder picker. `MARGEN_PICK_FOLDER=<path>` stands in for it in Seam 2 tests. */
async function pickFolder(): Promise<string | undefined> {
  if (process.env.MARGEN_PICK_FOLDER) return process.env.MARGEN_PICK_FOLDER
  const window = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Open' }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  return result.canceled ? undefined : result.filePaths[0]
}

function createWindow(): BrowserWindow {
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
    },
  })
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
    // `MARGEN_PROJECTS_DIR` stands in for ~/Documents/Margen in Seam 2 tests.
    projectsDir: process.env.MARGEN_PROJECTS_DIR ?? join(app.getPath('documents'), 'Margen'),
  })
  bindHostToIpc(host, ipcMain, () => BrowserWindow.getAllWindows(), FORWARDED_EVENTS)
  if (updates) {
    const check = () => void host.call('update.check')
    setTimeout(check, FIRST_UPDATE_CHECK_MS)
    setInterval(check, UPDATE_CHECK_INTERVAL_MS)
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
