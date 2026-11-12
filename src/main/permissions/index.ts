import type { AgentEvent } from '@shared/agent'
import type { PermissionPreset } from '@shared/host-api'
import { inProject } from '../projects/inside'

// The one place that decides whether the Agent may use a tool without asking.
// Providers translate their own tool calls into a ToolRequest, ask the policy,
// and turn "ask" into the approval-request from `approvalRequest`.

export type ToolRequest =
  /** `tool` is the Agent's own name for it (Read, Edit…), shown on the approval card. */
  | { kind: 'read' | 'write'; path: string; tool?: string }
  | { kind: 'web' }
  | { kind: 'shell'; command: string }
  | { kind: 'other'; name: string }
  /** One of Margen's own tools (`agent/tools.ts`): they only read and measure, so they never ask. */
  | { kind: 'margen'; name: string }

export type PermissionDecision = 'allow' | 'ask'

export type PermissionPolicy = (request: ToolRequest) => Promise<PermissionDecision>

/**
 * The Editor preset: reads anywhere in the Project, writes inside it and the web
 * are allowed; shell commands, any path outside the Project and anything else ask.
 */
export function editorPolicy(projectDir: string): PermissionPolicy {
  return async (request) => {
    switch (request.kind) {
      case 'read':
      case 'write':
        return inProject(projectDir, request.path) === null ? 'ask' : 'allow'
      case 'web':
      case 'margen':
        return 'allow'
      default:
        return 'ask'
    }
  }
}

/** The policy of the preset `preset()` gives at the time of each request, so a change applies from the next one. */
export function presetPolicy(projectDir: string, preset: () => Promise<PermissionPreset>): PermissionPolicy {
  const editor = editorPolicy(projectDir)
  return async (request) => ((await preset()) === 'allow-everything' ? 'allow' : editor(request))
}

/** The approval-request for a request the policy says to ask about. */
export function approvalRequest(id: string, request: ToolRequest): Extract<AgentEvent, { type: 'approval-request' }> {
  switch (request.kind) {
    case 'shell':
      return { type: 'approval-request', id, kind: 'shell', detail: request.command }
    case 'read':
    case 'write':
      return {
        type: 'approval-request',
        id,
        kind: 'outside-project',
        detail: `${request.tool ?? (request.kind === 'read' ? 'Read' : 'Write')} ${request.path}`,
      }
    case 'web':
      return { type: 'approval-request', id, kind: 'other', detail: 'Web' }
    case 'other':
    case 'margen':
      return { type: 'approval-request', id, kind: 'other', detail: request.name }
  }
}
