import { BrowserWindow } from 'electron'
import { DOCUMENT_BRIDGE_CHANNEL, DOCUMENT_PARTITION, parseFromDocument, type ClockState, type ToDocument } from '@shared/document-bridge'
import type { VideoFrames } from './video/export'

// The frames of an export (`video/export.ts`): the Document loaded again in an
// offscreen window at its frame size and a device scale of 1, whatever the
// editor's window looks like, with Margen's script as its preload. Each frame
// is a seek of the page's clock and a capture once the page says it's drawn.

const LOAD_TIMEOUT_MS = 20_000
const FRAME_TIMEOUT_MS = 10_000

export async function openVideoFrames(url: string, preload: string): Promise<VideoFrames> {
  const window = new BrowserWindow({
    show: false,
    width: 1920,
    height: 1080,
    useContentSize: true,
    enableLargerThanScreen: true,
    webPreferences: {
      offscreen: { deviceScaleFactor: 1 },
      partition: DOCUMENT_PARTITION,
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  const contents = window.webContents
  // Like the Document view, it never leaves the page or opens another.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => event.preventDefault())
  contents.setAudioMuted(true)

  const waiting = new Map<string, (clock: ClockState) => void>()
  contents.ipc.on(DOCUMENT_BRIDGE_CHANNEL, (_event, raw: unknown) => {
    const message = parseFromDocument(raw)
    if (message?.type === 'clock' && message.id) waiting.get(message.id)?.(message.clock)
  })
  let gone: string | null = null
  contents.on('render-process-gone', () => (gone = 'The Document stopped while exporting'))

  const send = (message: ToDocument) => contents.send(DOCUMENT_BRIDGE_CHANNEL, message)
  let seeks = 0
  /** Seeks the clock and resolves once that frame has been drawn. */
  function seek(time: number, timeout = FRAME_TIMEOUT_MS): Promise<ClockState> {
    if (gone) return Promise.reject(new Error(gone))
    const id = `export-${seeks++}`
    return new Promise<ClockState>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id)
        reject(new Error(gone ?? 'The Document didn’t draw the frame in time'))
      }, timeout)
      waiting.set(id, (clock) => {
        clearTimeout(timer)
        waiting.delete(id)
        resolve(clock)
      })
      send({ type: 'clock-seek', time, id })
    })
  }

  try {
    await contents.loadURL(url)
    send({ type: 'export' })
    // No answer: the page isn't (or no longer is) an Animation video.
    let clock = await seek(0, LOAD_TIMEOUT_MS).catch(() => {
      throw new Error('The Document isn’t an Animation video')
    })
    const [width, height] = window.getContentSize()
    if (clock.frame.width !== width || clock.frame.height !== height) {
      window.setContentSize(Math.max(1, Math.round(clock.frame.width)), Math.max(1, Math.round(clock.frame.height)))
      clock = await seek(0)
    }
    const size = { width: Math.round(clock.frame.width), height: Math.round(clock.frame.height) }
    return {
      length: clock.length,
      size,
      async frame(time) {
        await seek(time)
        const image = await contents.capturePage({ x: 0, y: 0, ...size })
        // Skia's N32: BGRA on the Mac.
        return { ...image.getSize(), data: image.toBitmap() }
      },
      close: () => window.destroy(),
    }
  } catch (error) {
    window.destroy()
    throw error
  }
}
