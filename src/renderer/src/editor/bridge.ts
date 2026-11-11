import { DOCUMENT_BRIDGE_CHANNEL, parseFromDocument, type FromDocument, type ToDocument } from '@shared/document-bridge'

// The editor's end of the Document bridge (`src/shared/document-bridge.ts`).

/** The parts of Electron's `<webview>` element the editor uses. The renderer can't import Electron's types. */
export interface WebviewElement extends HTMLElement {
  send(channel: string, ...args: unknown[]): Promise<void>
  reloadIgnoringCache(): void
}

export interface DocumentBridge {
  send(message: ToDocument): void
  /** Listens for checked messages from the page's script. Returns a function that stops listening. */
  on(listener: (message: FromDocument) => void): () => void
}

export function connectDocument(view: WebviewElement): DocumentBridge {
  return {
    send(message) {
      void view.send(DOCUMENT_BRIDGE_CHANNEL, message).catch(() => {})
    },
    on(listener) {
      const handler = (event: Event) => {
        const { channel, args } = event as Event & { channel: string; args: unknown[] }
        const message = channel === DOCUMENT_BRIDGE_CHANNEL ? parseFromDocument(args[0]) : null
        if (message) listener(message)
      }
      view.addEventListener('ipc-message', handler)
      return () => view.removeEventListener('ipc-message', handler)
    },
  }
}
