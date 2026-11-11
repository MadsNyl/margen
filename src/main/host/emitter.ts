type Listener<T> = (payload: T) => void

export function createEmitter<Events extends object>() {
  const listeners = new Map<keyof Events, Set<Listener<never>>>()
  return {
    on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
      let set = listeners.get(event)
      if (!set) listeners.set(event, (set = new Set()))
      set.add(listener)
      return () => set.delete(listener)
    },
    emit<K extends keyof Events>(event: K, payload: Events[K]): void {
      for (const listener of listeners.get(event) ?? []) (listener as Listener<Events[K]>)(payload)
    },
    clear(): void {
      listeners.clear()
    },
  }
}
