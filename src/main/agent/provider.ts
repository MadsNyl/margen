import type { AgentEvent, AgentSetupResult, AgentStatus, ApprovalDecision, TurnInput } from '@shared/agent'
import type { PermissionPolicy } from '../permissions'

// Hides which Agent is running (Claude Code in v1, Codex in 1.1).
// Shape from the spec: Implementation Decisions, Agent integration.

export interface StartSessionOptions {
  projectDir: string
  model?: string
  effort?: string
  resumeId?: string
  /** Decides which tool calls run without asking. Defaults to `projectPolicy(projectDir)`. */
  permissions?: PermissionPolicy
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
  /** The Agent's own session id, used to resume it. */
  id: string
  /** Starts a Turn. Send the next one only after this one's turn-end: an Agent may merge Turns sent mid-Turn. */
  send(turn: TurnInput): void
  /** Ends the running Turn; it ends with turn-end "interrupted". */
  interrupt(): Promise<void>
  events: AsyncIterable<AgentEvent>
  answerApproval(id: string, decision: ApprovalDecision): void
  /** Stops the Agent. The Session can't be used afterwards; resume it by id instead. */
  close(): void
}
