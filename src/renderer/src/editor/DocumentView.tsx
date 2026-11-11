import { useEffect, useRef } from 'react'
import { DOCUMENT_PARTITION, type ScrollPosition } from '@shared/document-bridge'
import type { OpenDocument } from '@shared/host-api'
import { host } from '../host'
import { connectDocument, type DocumentBridge, type WebviewElement } from './bridge'

/**
 * The Document, rendered live in a `<webview>`: its own process and session, no
 * Node, Margen's script as its preload (main enforces all three). It reloads when
 * the host says the file changed and puts the scroll position back afterwards.
 * Being a DOM element, it lets the editor's overlays (Pick, Draw: 12–14) sit above it.
 */
export function DocumentView({
  document,
  onReady,
  onReloaded,
}: {
  document: OpenDocument
  /** Margen's script in the page is listening (`false` while the page loads). Hands over the bridge to it. */
  onReady: (bridge: DocumentBridge | null) => void
  onReloaded: () => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onReady, onReloaded })
  useEffect(() => {
    callbacks.current = { onReady, onReloaded }
  })

  useEffect(() => {
    // Created by hand so the partition is set before the first navigation, as Electron requires.
    const view = window.document.createElement('webview') as WebviewElement
    view.setAttribute('partition', DOCUMENT_PARTITION)
    view.setAttribute('src', document.url)
    view.style.cssText = 'display:flex;width:100%;height:100%'
    const bridge = connectDocument(view)
    let scroll: ScrollPosition | null = null
    let reloading = false

    const off = bridge.on((message) => {
      if (message.type === 'scroll') scroll = message.scroll
      else if (message.type === 'ready') {
        if (reloading && scroll) bridge.send({ type: 'restore-scroll', scroll })
        if (reloading) callbacks.current.onReloaded()
        reloading = false
        callbacks.current.onReady(bridge)
      }
    })
    const offUpdated = host.on('document.updated', ({ path }) => {
      if (path !== document.path) return
      reloading = true
      callbacks.current.onReady(null)
      view.reloadIgnoringCache()
    })
    container.current?.appendChild(view)
    return () => {
      off()
      offUpdated()
      view.remove()
    }
  }, [document.path, document.url])

  return <div ref={container} className="size-full" />
}
