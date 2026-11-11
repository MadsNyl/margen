import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PermissionPreset } from '@shared/host-api'

// The chosen permission preset, kept in Margen's data directory. Read once,
// then held in memory so every tool request sees a change straight away.

export interface PresetStore {
  get(): Promise<PermissionPreset>
  set(preset: PermissionPreset): Promise<void>
}

const PRESETS: readonly PermissionPreset[] = ['editor', 'allow-everything']

export function isPreset(value: unknown): value is PermissionPreset {
  return PRESETS.includes(value as PermissionPreset)
}

export function createPresetStore(dataDir: string): PresetStore {
  const file = join(dataDir, 'permissions.json')
  let current: Promise<PermissionPreset> | undefined

  async function read(): Promise<PermissionPreset> {
    try {
      const { preset } = JSON.parse(await readFile(file, 'utf8')) as { preset?: unknown }
      return isPreset(preset) ? preset : 'editor'
    } catch {
      return 'editor'
    }
  }

  return {
    get: () => (current ??= read()),
    async set(preset) {
      current = Promise.resolve(preset)
      await mkdir(dataDir, { recursive: true })
      await writeFile(file, JSON.stringify({ preset }, null, 2))
    },
  }
}
