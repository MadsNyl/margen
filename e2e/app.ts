import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import type { FakeAgentScript } from '../src/main/agent/fake'
import type { StoredRecent } from '../src/main/projects/recents'

export interface LaunchOptions {
  recents?: StoredRecent[]
  agent?: FakeAgentScript
  /** The folder the native folder picker returns. */
  pickFolder?: string
}

export interface LaunchedApp {
  app: ElectronApplication
  window: Page
  dataDir: string
  close(): Promise<void>
}

/** Launches the built app with a fresh data directory and the fake AgentProvider. */
export async function launchApp({ recents, agent = {}, pickFolder }: LaunchOptions = {}): Promise<LaunchedApp> {
  const dataDir = await mkdtemp(join(tmpdir(), 'margen-e2e-'))
  if (recents) await writeFile(join(dataDir, 'recents.json'), JSON.stringify(recents))
  const agentScript = join(dataDir, 'fake-agent.json')
  await writeFile(agentScript, JSON.stringify(agent))

  // Shells started from inside another Electron app can carry ELECTRON_RUN_AS_NODE,
  // which would start Electron as plain Node.
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...env } = process.env
  const app = await electron.launch({
    args: [resolve(__dirname, '../out/main/index.js')],
    env: {
      ...env,
      MARGEN_DATA_DIR: dataDir,
      MARGEN_FAKE_AGENT: agentScript,
      ...(pickFolder && { MARGEN_PICK_FOLDER: pickFolder }),
    } as Record<string, string>,
  })
  const window = await app.firstWindow()
  return {
    app,
    window,
    dataDir,
    async close() {
      await app.close()
      await rm(dataDir, { recursive: true, force: true })
    },
  }
}

/** Makes a temporary folder holding the given files, for use as a Project. */
export async function makeFolder(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'margen-fixture-'))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await writeFile(join(dir, path), content)
  }
  return dir
}
