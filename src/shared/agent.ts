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

export interface TurnInput {
  text: string
  annotations: Annotation[]
}

export type ApprovalDecision = 'allow-once' | 'deny'

export type AgentEvent =
  | { type: 'thinking' }
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: 'read' | 'edit' | 'write'; file: string; added?: number; removed?: number }
  | { type: 'approval-request'; id: string; kind: 'shell' | 'outside-project'; detail: string }
  | { type: 'turn-end'; reason: 'done' | 'interrupted' }
  | { type: 'error'; message: string }
