import { useEffect, useState } from 'react'
import type { HostCallName, HostCallResult, HostEventName, HostEvents } from '@shared/host-api'

/** The host API. The renderer reaches the main process only through this. */
export const host = window.margen

/** Loads a host call's result, then keeps it current from an event carrying the same data. */
export function useHostValue<K extends HostCallName, E extends HostEventName>(
  call: K,
  event: E,
): HostCallResult<K> | undefined {
  const [value, setValue] = useState<HostCallResult<K>>()
  useEffect(() => {
    let live = true
    const off = host.on(event, (payload: HostEvents[E]) => setValue(payload as HostCallResult<K>))
    void (host.call as (name: K) => Promise<HostCallResult<K>>)(call).then((result) => {
      if (live) setValue(result)
    })
    return () => {
      live = false
      off()
    }
  }, [call, event])
  return value
}
