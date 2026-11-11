// electron-builder hooks for dugite's bundled git. dugite downloads git for
// the machine's own arch on install; before each arch is packed this fetches
// the one for that arch (x64 on an Apple silicon runner), and afterwards puts
// the machine's own back. Archives are cached in the temp folder.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

// electron-builder's Arch enum.
const ARCHS = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64' }

export function downloadGit(arch) {
  execFileSync(process.execPath, [createRequire(import.meta.url).resolve('dugite/script/download-git.js')], {
    env: { ...process.env, npm_config_arch: arch },
    stdio: 'inherit',
  })
}

/** beforePack */
export default async function gitForArch({ arch }) {
  if (!ARCHS[arch]) throw new Error(`No embedded git for arch ${arch}`)
  downloadGit(ARCHS[arch])
}
