// electron-builder afterPack hook for the Voice addons (sherpa-onnx and
// piper-phonemize). pnpm installs both Mac arches (supportedArchitectures in
// pnpm-workspace.yaml) so either arch can be packed on one machine; this drops
// the other arch's native files from each packed app.
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

// electron-builder's Arch enum.
const ARCHS = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64' }
const PACKAGES = ['sherpa-onnx', 'piper-phonemize']

export default async function voiceAddonsForArch({ appOutDir, arch, electronPlatformName, packager }) {
  if (electronPlatformName !== 'darwin') return
  const own = ARCHS[arch]
  const modules = join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules')
  for (const other of ['arm64', 'x64'].filter((a) => a !== own)) {
    for (const name of PACKAGES) await rm(join(modules, `${name}-darwin-${other}`), { recursive: true, force: true })
  }
}
