import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import type { TurnInput } from '../src/shared/agent'
import type { FakeAgentScript } from '../src/main/agent/fake'
import type { StoredRecent } from '../src/main/projects/recents'
import type { PermissionPreset } from '../src/shared/host-api'

export interface LaunchOptions {
  recents?: StoredRecent[]
  agent?: FakeAgentScript
  /** The folder the native folder picker returns. */
  pickFolder?: string
  /** The permission preset chosen before launch; the Editor preset when left out. */
  preset?: PermissionPreset
}

export interface LaunchedApp {
  app: ElectronApplication
  window: Page
  dataDir: string
  /** Stands in for ~/Documents/Margen, where new Projects are made. Inside `dataDir`. */
  projectsDir: string
  /** Every TurnInput that reached the fake Agent, in order. */
  sentTurns(): Promise<TurnInput[]>
  close(): Promise<void>
}

/** Launches the built app with a fresh data directory and the fake AgentProvider. */
export async function launchApp({ recents, agent = {}, pickFolder, preset }: LaunchOptions = {}): Promise<LaunchedApp> {
  const dataDir = await mkdtemp(join(tmpdir(), 'margen-e2e-'))
  if (recents) await writeFile(join(dataDir, 'recents.json'), JSON.stringify(recents))
  if (preset) await writeFile(join(dataDir, 'permissions.json'), JSON.stringify({ preset }))
  const agentScript = join(dataDir, 'fake-agent.json')
  const sentFile = join(dataDir, 'fake-agent-sent.json')
  await writeFile(agentScript, JSON.stringify({ sentFile, ...agent }))
  const projectsDir = join(dataDir, 'Documents', 'Margen')

  // Shells started from inside another Electron app can carry ELECTRON_RUN_AS_NODE,
  // which would start Electron as plain Node.
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...env } = process.env
  const app = await electron.launch({
    args: [resolve(__dirname, '../out/main/index.js')],
    env: {
      ...env,
      MARGEN_DATA_DIR: dataDir,
      MARGEN_FAKE_AGENT: agentScript,
      MARGEN_PROJECTS_DIR: projectsDir,
      ...(pickFolder && { MARGEN_PICK_FOLDER: pickFolder }),
    } as Record<string, string>,
  })
  const window = await app.firstWindow()
  return {
    app,
    window,
    dataDir,
    projectsDir,
    sentTurns: () => readFile(sentFile, 'utf8').then((json) => JSON.parse(json) as TurnInput[], () => []),
    async close() {
      await app.close()
      await rm(dataDir, { recursive: true, force: true })
    },
  }
}

/** Evaluates `expression` inside the Document view. Playwright doesn't attach to `<webview>` guests, so this goes through the main process. */
export function inDocument(app: ElectronApplication, expression: string): Promise<unknown> {
  return app.evaluate(({ webContents }, expr) => {
    const guest = webContents.getAllWebContents().filter((w) => w.getType() === 'webview' && !w.isDestroyed())
    return guest.at(-1)?.executeJavaScript(expr)
  }, expression)
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
