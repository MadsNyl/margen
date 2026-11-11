import { readFileSync } from 'node:fs'
import { createClaudeCodeProvider } from './claude'
import { createNodeSystem } from './claude/node-system'
import { createFakeAgentProvider, type FakeAgentScript } from './fake'
import type { AgentProvider } from './provider'

/**
 * Picks the AgentProvider for the app: Claude Code on the user's Mac, or with
 * `MARGEN_FAKE_AGENT=<script.json>` the fake (Seam 2 tests).
 */
export function chooseAgentProvider(env: NodeJS.ProcessEnv): AgentProvider {
  const scriptPath = env.MARGEN_FAKE_AGENT
  if (scriptPath) return createFakeAgentProvider(JSON.parse(readFileSync(scriptPath, 'utf8')) as FakeAgentScript)
  return createClaudeCodeProvider(createNodeSystem(env))
}
