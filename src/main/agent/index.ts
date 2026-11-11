import { readFileSync } from 'node:fs'
import { createFakeAgentProvider, type FakeAgentScript } from './fake'
import type { AgentProvider } from './provider'

/**
 * Picks the AgentProvider for the app. `MARGEN_FAKE_AGENT=<script.json>` selects
 * the fake (Seam 2 tests). The Claude Code provider arrives in ticket 07; until
 * then the app reports no Agent installed.
 */
export function chooseAgentProvider(env: NodeJS.ProcessEnv): AgentProvider {
  const scriptPath = env.MARGEN_FAKE_AGENT
  if (scriptPath) return createFakeAgentProvider(JSON.parse(readFileSync(scriptPath, 'utf8')) as FakeAgentScript)
  return {
    detect: async () => ({ installed: false, signedIn: false }),
    startSession: () => {
      throw new Error('No Agent is available yet')
    },
  }
}
