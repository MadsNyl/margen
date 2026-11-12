import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

// Applied to the built app only: the dev server's React refresh needs an inline script.
// `frame-src margen-doc:` is the one deliberate relaxation: the Document view (a
// `<webview>`) loads the Document from the margen-doc:// protocol. `media-src blob:`
// plays a Voice's speech, which arrives as WAV bytes over the host API.
const csp: Plugin = {
  name: 'margen-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content:
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; font-src 'self' data:; frame-src margen-doc:",
      },
      injectTo: 'head',
    },
  ],
}

const shared = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        // index: the main process. voice-worker: the Voices utility process (sherpa-onnx).
        input: { index: resolve(__dirname, 'src/main/index.ts'), 'voice-worker': resolve(__dirname, 'src/main/voice-worker.ts') },
      },
    },
  },
  preload: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        // index: the app's preload (window.margen). document: Margen's script inside the Document view.
        input: { index: resolve(__dirname, 'src/preload/index.ts'), document: resolve(__dirname, 'src/preload/document.ts') },
      },
    },
  },
  renderer: {
    resolve: { alias: shared },
    plugins: [react(), tailwindcss(), csp],
  },
})
