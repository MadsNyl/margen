import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Effort, ModelChoice } from '@shared/agent'

// The model and effort chosen last in the Composer, kept app-wide in Margen's
// data directory so every Document (and the next launch) starts with them.

export interface ModelChoiceStore {
  get(): Promise<ModelChoice>
  set(choice: ModelChoice): Promise<void>
}

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export function isModelChoice(value: unknown): value is ModelChoice {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { model, effort, ...rest } = value as Record<string, unknown>
  return (
    Object.keys(rest).length === 0 &&
    (model === undefined || (typeof model === 'string' && model.length > 0 && model.length <= 200)) &&
    (effort === undefined || EFFORTS.includes(effort as Effort))
  )
}

export function createModelChoiceStore(dataDir: string): ModelChoiceStore {
  const file = join(dataDir, 'model.json')
  let current: Promise<ModelChoice> | undefined

  async function read(): Promise<ModelChoice> {
    try {
      const stored: unknown = JSON.parse(await readFile(file, 'utf8'))
      return isModelChoice(stored) ? stored : {}
    } catch {
      return {}
    }
  }

  return {
    get: () => (current ??= read()),
    async set(choice) {
      current = Promise.resolve(choice)
      await mkdir(dataDir, { recursive: true })
      await writeFile(file, JSON.stringify(choice, null, 2))
    },
  }
}
