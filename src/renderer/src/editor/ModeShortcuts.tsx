import { useEffect, useRef } from 'react'
import type { Mode, ModeKey } from '@shared/document-bridge'
import type { DocumentBridge } from './bridge'
import { useDraft } from './draft'

// The editor's shortcut keys, wherever the focus is (the page's script passes
// them on while the Document has it): V Browse, P Pick, D Draw, Esc discards the open
// Annotation or goes back to Browse. Not while typing. An Esc that does either is
// taken (`preventDefault`), so it doesn't also stop a running Turn (ChatPanel);
// one from the Document that did nothing is passed on to the editor's window for that.

const MODES: Partial<Record<ModeKey, Mode>> = { v: 'browse', p: 'pick', d: 'draw' }

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))

export function ModeShortcuts({ bridge, mode, onMode }: { bridge: DocumentBridge | null; mode: Mode; onMode: (mode: Mode) => void }) {
  const draft = useDraft()
  /** Returns whether it used the key. */
  const press = useRef<(key: ModeKey) => boolean>(() => false)
  useEffect(() => {
    press.current = (key) => {
      if (key !== 'Escape') {
        const next = MODES[key]
        if (next) onMode(next)
      } else if (draft.open) {
        draft.remove(draft.open)
        return true
      } else if (mode !== 'browse') {
        onMode('browse')
        return true
      }
      return false
    }
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      const key = event.key === 'Escape' ? 'Escape' : event.key.toLowerCase()
      if ((key === 'Escape' || key in MODES) && press.current(key as ModeKey)) event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(
    () =>
      bridge?.on((message) => {
        if (message.type !== 'key' || press.current(message.key) || message.key !== 'Escape') return
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
      }),
    [bridge],
  )

  return null
}
