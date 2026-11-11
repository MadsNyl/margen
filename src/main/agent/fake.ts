import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AgentEvent, AgentSetupResult, AgentStatus, ApprovalDecision, TurnInput } from '@shared/agent'
import { createChannel } from './channel'
import type { AgentProvider, AgentSession, StartSessionOptions } from './provider'

// A stand-in Agent for Seam 1 and Seam 2 tests. Each `send` plays back the
// next scripted Turn; a turn-end is added when the script doesn't end with one.
// An approval-request pauses the Turn until it's answered, `wait` makes a slow
// Turn, and `interrupt` ends the running Turn with turn-end "interrupted".
// Install and Sign in play back their scripted outcome (done by default) after
// `ms`; a done one updates what `detect` reports from then on.

type ToolEvent = Extract<AgentEvent, { type: 'tool' }>

export type FakeStep =
  | Exclude<AgentEvent, ToolEvent>
  /** With `content`, an edit or write really writes the file (relative to the Project) before the event is emitted. */
  | (ToolEvent & { content?: string })
  | { type: 'wait'; ms: number }

export interface FakeSetupStep {
  result: 'done' | 'failed'
  /** How long the step takes. */
  ms?: number
  /** For failed: what went wrong. */
  message?: string
}

export interface FakeAgentScript {
  detect?: AgentStatus
  install?: FakeSetupStep & { version?: string }
  signIn?: FakeSetupStep & { plan?: string }
  turns?: FakeStep[][]
}

export interface FakeAgentProvider extends AgentProvider {
  /** Every TurnInput sent to any of its Sessions, in order. */
  sent: TurnInput[]
  /** Every approval answer given to any of its Sessions, in order. */
  approvals: { id: string; decision: ApprovalDecision }[]
}

const fallbackTurn: FakeStep[] = [{ type: 'text', text: 'OK.' }]

export function createFakeAgentProvider(script: FakeAgentScript = {}): FakeAgentProvider {
  let status = script.detect ?? { installed: true, version: 'fake', signedIn: true }
  const turns = [...(script.turns ?? [])]
  const sent: TurnInput[] = []
  const approvals: FakeAgentProvider['approvals'] = []
  let sessionCount = 0

  function startSession({ projectDir, resumeId }: StartSessionOptions): AgentSession {
    const id = resumeId ?? `fake-session-${++sessionCount}`
    const channel = createChannel<AgentEvent>()
    const pendingApprovals = new Map<string, () => void>()
    let queue = Promise.resolve()
    let interruptCurrent: (() => void) | undefined

    async function play(steps: FakeStep[]) {
      let interrupted = false
      const stopped = new Promise<void>((resolve) => {
        interruptCurrent = () => {
          interrupted = true
          resolve()
        }
      })
      const unlessInterrupted = (work: Promise<unknown>) => Promise.race([work, stopped])

      for (const step of steps) {
        if (interrupted) break
        if (step.type === 'wait') {
          let timer: NodeJS.Timeout | undefined
          await unlessInterrupted(new Promise((resolve) => (timer = setTimeout(resolve, step.ms))))
          clearTimeout(timer)
          continue
        }
        if (step.type === 'tool') {
          const { content, ...event } = step
          if (content !== undefined) {
            const path = join(projectDir, step.file)
            await mkdir(dirname(path), { recursive: true })
            await writeFile(path, content)
          }
          channel.push(event)
          continue
        }
        channel.push(step)
        if (step.type === 'approval-request') {
          await unlessInterrupted(new Promise<void>((resolve) => pendingApprovals.set(step.id, resolve)))
        }
        if (step.type === 'turn-end') return
      }
      interruptCurrent = undefined
      channel.push({ type: 'turn-end', reason: interrupted ? 'interrupted' : 'done' })
    }

    return {
      id,
      events: channel.iterable,
      send(turn) {
        sent.push(turn)
        const steps = turns.shift() ?? fallbackTurn
        queue = queue.then(() => play(steps))
      },
      async interrupt() {
        interruptCurrent?.()
      },
      answerApproval(approvalId, decision) {
        approvals.push({ id: approvalId, decision })
        pendingApprovals.get(approvalId)?.()
        pendingApprovals.delete(approvalId)
      },
    }
  }

  async function setup(step: FakeSetupStep | undefined, change: Partial<AgentStatus>): Promise<AgentSetupResult> {
    if (step?.ms) await new Promise((resolve) => setTimeout(resolve, step.ms))
    if (step?.result === 'failed') return { ok: false, status, message: step.message ?? 'Failed' }
    status = { ...status, ...change }
    return { ok: true, status }
  }

  return {
    sent,
    approvals,
    detect: async () => status,
    install: () => setup(script.install, { installed: true, version: script.install?.version ?? status.version ?? 'fake' }),
    signIn: () =>
      setup(script.signIn, { signedIn: true, ...(script.signIn?.plan !== undefined && { plan: script.signIn.plan }) }),
    startSession,
  }
}
