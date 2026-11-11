import type { BrowserWindow, IpcMain } from 'electron'
import { HOST_CALL_CHANNEL, HOST_EVENT_CHANNEL, type HostCallName, type HostEventName, type HostEvents } from '@shared/host-api'
import type { Host } from './host'

// The Electron adapter for the host API: calls arrive on one invoke channel,
// events go out to every window on one send channel. No domain logic here.

export function bindHostToIpc(host: Host, ipcMain: IpcMain, windows: () => BrowserWindow[], events: HostEventName[]) {
  ipcMain.handle(HOST_CALL_CHANNEL, (_event, name: HostCallName, args: unknown[]) =>
    (host.call as (name: HostCallName, ...args: unknown[]) => Promise<unknown>)(name, ...args),
  )
  const unsubscribes = events.map((event) =>
    host.on(event, (payload: HostEvents[typeof event]) => {
      for (const window of windows()) window.webContents.send(HOST_EVENT_CHANNEL, event, payload)
    }),
  )
  return () => {
    ipcMain.removeHandler(HOST_CALL_CHANNEL)
    for (const unsubscribe of unsubscribes) unsubscribe()
  }
}
