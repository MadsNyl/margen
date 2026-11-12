import type { AgentEvent, AgentSetupResult, AgentStatus, ApprovalDecision, Effort, TurnInput } from '@shared/agent'
import type { PermissionPolicy } from '../permissions'
import type { AgentTool } from './tools'

// Hides which Agent is running (Claude Code in v1, Codex in 1.1).
// Shape from the spec: Implementation Decisions, Agent integration.

export interface StartSessionOptions {
  projectDir: string
  /** The open Document, relative to the Project; the prompt names it. */
  document?: string
  /** The model and effort for Turns that don't choose their own. */
  model?: string
  effort?: Effort
  resumeId?: string
  /** The Template's instructions when the Document is marked with one: the Agent follows them for the whole Session. */
  instructions?: string
  /** Margen's own tools the Agent may call in this Session (`./tools.ts`); they run without asking. */
  tools?: AgentTool[]
  /** Decides which tool calls run without asking. Defaults to the Editor preset, `editorPolicy(projectDir)`. */
  permissions?: PermissionPolicy
}

export interface AgentProvider {
  detect(): Promise<AgentStatus>
  /** Runs the Agent's official installer, then detects again. */
  install(): Promise<AgentSetupResult>
  /** Opens the Agent's own login in Terminal, then waits until it reports signed in. */
  signIn(): Promise<AgentSetupResult>
  /** Stops a Sign in that's waiting: it ends with `cancelled`. The login in Terminal is the user's to close. */
  cancelSignIn(): void
  /**
   * A short file name for a new Document that `description` asks for: a few
   * lowercase words joined by hyphens, no extension. Undefined when the Agent
   * can't say (signed out, offline, too slow); the caller names it itself then.
   */
  nameDocument(description: string): Promise<string | undefined>
  startSession(opts: StartSessionOptions): AgentSession
}

/** The spec calls this `Session`; named AgentSession here so it doesn't clash with Margen's own Sessions. */
export interface AgentSession {
  /** The Agent's own session id, used to resume it. */
  id: string
  /**
   * Starts a Turn, with the TurnInput's model and effort when it has them. Send the next one
   * only after this one's turn-end: an Agent may merge Turns sent mid-Turn.
   */
  send(turn: TurnInput): void
  /** Ends the running Turn; it ends with turn-end "interrupted". */
  interrupt(): Promise<void>
  events: AsyncIterable<AgentEvent>
  answerApproval(id: string, decision: ApprovalDecision): void
  /** Stops the Agent. The Session can't be used afterwards; resume it by id instead. */
  close(): void
}
