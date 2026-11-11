import { useEffect, useRef } from 'react'
import type { Mode, ModeKey } from '@shared/document-bridge'
import type { DocumentBridge } from './bridge'
import { useDraft } from './draft'

// The editor's shortcut keys, wherever the focus is (the page's script passes
// them on while the Document has it): V Browse, P Pick, Esc discards the open
// Annotation or goes back to Browse. Not while typing.

const MODES: Partial<Record<ModeKey, Mode>> = { v: 'browse', p: 'pick' }

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))

export function ModeShortcuts({ bridge, mode, onMode }: { bridge: DocumentBridge | null; mode: Mode; onMode: (mode: Mode) => void }) {
  const draft = useDraft()
  const press = useRef<(key: ModeKey) => void>(() => {})
  useEffect(() => {
    press.current = (key) => {
      if (key !== 'Escape') {
        const next = MODES[key]
        if (next) onMode(next)
      } else if (draft.open) draft.remove(draft.open)
      else if (mode !== 'browse') onMode('browse')
    }
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      const key = event.key === 'Escape' ? 'Escape' : event.key.toLowerCase()
      if (key === 'Escape' || key in MODES) press.current(key as ModeKey)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(
    () =>
      bridge?.on((message) => {
        if (message.type === 'key') press.current(message.key)
      }),
    [bridge],
  )

  return null
}
