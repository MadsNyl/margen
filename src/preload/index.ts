import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { HOST_CALL_CHANNEL, HOST_EVENT_CHANNEL, type HostApi } from '@shared/host-api'

// Exposes the host API as `window.margen`, and nothing else.

const margen: HostApi = {
  call: (name, ...args) => ipcRenderer.invoke(HOST_CALL_CHANNEL, name, args),
  on(event, listener) {
    const handler = (_e: IpcRendererEvent, name: string, payload: unknown) => {
      if (name === event) listener(payload as Parameters<typeof listener>[0])
    }
    ipcRenderer.on(HOST_EVENT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(HOST_EVENT_CHANNEL, handler)
  },
}

contextBridge.exposeInMainWorld('margen', margen)
