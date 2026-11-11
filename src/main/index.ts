import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import type { HostEventName } from '@shared/host-api'
import { chooseAgentProvider } from './agent'
import { createHost } from './host'
import { bindHostToIpc } from './ipc'

// Electron bootstrap only: windows, security settings and wiring the host API
// to IPC. Domain logic lives in framework-free modules behind `createHost`.

const FORWARDED_EVENTS: HostEventName[] = ['recents.changed']

if (process.env.MARGEN_DATA_DIR) app.setPath('userData', process.env.MARGEN_DATA_DIR)

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
  const host = createHost({ dataDir: app.getPath('userData'), agent: chooseAgentProvider(process.env) })
  bindHostToIpc(host, ipcMain, () => BrowserWindow.getAllWindows(), FORWARDED_EVENTS)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
