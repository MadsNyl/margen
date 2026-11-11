// Data that crosses the AgentProvider boundary and, as Turn progress, the
// host API. The AgentProvider interface itself is in src/main/agent/provider.ts.

export interface AgentStatus {
  installed: boolean
  /** Where the Agent's CLI was found. */
  path?: string
  version?: string
  signedIn: boolean
  plan?: string
}

/** How an onboarding step (Install, Sign in) ended, with the status detected afterwards. */
export type AgentSetupResult = { ok: true; status: AgentStatus } | { ok: false; status: AgentStatus; message: string }

interface AnnotationBase {
  number: number
  comment: string
  viewportWidth: number
}

export interface ElementDescriptor {
  /** Short CSS path to the element. */
  selector: string
  tag: string
  /** Outer HTML, cut to a few hundred characters. */
  html: string
  text?: string
  /** Line range in the source file, when it can be found. */
  lines?: { start: number; end: number }
}

export interface PickAnnotation extends AnnotationBase, ElementDescriptor {
  kind: 'pick'
}

export interface Point {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface DrawAnnotation extends AnnotationBase {
  kind: 'draw'
  /** Strokes in page coordinates. */
  strokes: Point[][]
  boundingBox: Box
  /** The elements the strokes caught, up to five. */
  targets: ElementDescriptor[]
  /** PNG data URLs: the Viewport with strokes drawn in, and the strokes alone. */
  screenshot?: string
  crop?: string
}

export type Annotation = PickAnnotation | DrawAnnotation

/** How hard the Agent thinks. Left out, the Agent uses its own default. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface TurnInput {
  text: string
  annotations: Annotation[]
  /** The model for this Turn (`opus`, `sonnet`, `haiku` or a full id). Left out, the Agent's own default. */
  model?: string
  effort?: Effort
}

export type ApprovalDecision = 'allow-once' | 'deny'

/** A tool the Agent used. Events with the same `id` are one tool call: first `running`, then `done` or `failed`. */
export type ToolEvent = { type: 'tool'; id?: string; status?: 'running' | 'done' | 'failed' } & (
  | {
      tool: 'read' | 'edit' | 'write'
      /** Relative to the Project folder with `/` separators, or absolute when outside it. */
      file: string
      /** Lines added and removed, once an edit or write is done. */
      added?: number
      removed?: number
    }
  | {
      tool: 'shell' | 'search' | 'web' | 'other'
      /** The Agent's own name for the tool: Bash, Grep, WebFetch… */
      name: string
      /** What it ran on: the command, the pattern, the URL. */
      detail: string
    }
)

export type AgentEvent =
  /** The Agent is thinking. `text` is a piece of its (summarised) thoughts, when it shares them. */
  | { type: 'thinking'; text?: string }
  /** A piece of the reply. Consecutive text events join up into one reply. */
  | { type: 'text'; text: string }
  | ToolEvent
  | { type: 'approval-request'; id: string; kind: 'shell' | 'outside-project'; detail: string }
  /** Every Turn ends with exactly one turn-end; `failed` comes after an error event. */
  | { type: 'turn-end'; reason: 'done' | 'interrupted' | 'failed' }
  /** `signed-out`: the Agent's own login is missing or expired, so the fix is to sign in again. */
  | { type: 'error'; message: string; reason?: 'signed-out' | 'not-installed' }
