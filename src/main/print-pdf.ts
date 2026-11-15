import { BrowserWindow } from 'electron'
import { DOCUMENT_PARTITION } from '@shared/document-bridge'
import type { Page } from '@shared/templates'

// A PDF export (`document.exportPdf`): the Document loaded again in a hidden
// window, without Margen's script, and printed at its Template's page size with
// no margins and its backgrounds. The page's own print CSS decides what goes on
// each page (a Slides deck prints one slide per page).

export async function printPdf(url: string, page: Page): Promise<Uint8Array> {
  const window = new BrowserWindow({
    show: false,
    width: page.width,
    height: page.height,
    useContentSize: true,
    webPreferences: { partition: DOCUMENT_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  const contents = window.webContents
  // Like the Document view, it never leaves the page or opens another.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => event.preventDefault())
  contents.setAudioMuted(true)
  try {
    await contents.loadURL(url)
    await contents.executeJavaScript('document.fonts.ready.then(() => true)')
    return await contents.printToPDF({ pageSize: page.pdf, margins: { top: 0, bottom: 0, left: 0, right: 0 }, printBackground: true })
  } finally {
    window.destroy()
  }
}
