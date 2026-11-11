import type { AgentEvent, AgentSetupResult, AgentStatus, ApprovalDecision, TurnInput } from '@shared/agent'

// Hides which Agent is running (Claude Code in v1, Codex in 1.1).
// Shape from the spec: Implementation Decisions, Agent integration.

export interface StartSessionOptions {
  projectDir: string
  model?: string
  effort?: string
  resumeId?: string
}

export interface AgentProvider {
  detect(): Promise<AgentStatus>
  /** Runs the Agent's official installer, then detects again. */
  install(): Promise<AgentSetupResult>
  /** Opens the Agent's own login in Terminal, then waits until it reports signed in. */
  signIn(): Promise<AgentSetupResult>
  startSession(opts: StartSessionOptions): AgentSession
}

/** The spec calls this `Session`; named AgentSession here so it doesn't clash with Margen's own Sessions. */
export interface AgentSession {
  id: string
  send(turn: TurnInput): void
  interrupt(): Promise<void>
  events: AsyncIterable<AgentEvent>
  answerApproval(id: string, decision: ApprovalDecision): void
}
