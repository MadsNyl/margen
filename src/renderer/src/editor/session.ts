import { useEffect, useState } from 'react'
import type { SessionView } from '@shared/host-api'
import { host } from '../host'

/**
 * The open Document's active Session: what's there now, then each new entry as it
 * arrives. New session and resume replace it.
 */
export function useSession(document: string): SessionView | undefined {
  const [session, setSession] = useState<SessionView>()
  useEffect(() => {
    let live = true
    const offEntry = host.on('session.entry', (payload) => {
      if (payload.document !== document) return
      setSession((prev) =>
        prev?.id === payload.session && payload.index === prev.entries.length
          ? { ...prev, entries: [...prev.entries, payload.entry] }
          : prev,
      )
    })
    const offChanged = host.on('session.changed', (view) => {
      if (view.document === document) setSession(view)
    })
    void host.call('session.current').then((view) => {
      if (!live || view?.document !== document) return
      setSession((prev) => (prev && (prev.id !== view.id || prev.entries.length >= view.entries.length) ? prev : view))
    })
    return () => {
      live = false
      offEntry()
      offChanged()
    }
  }, [document])
  return session
}
