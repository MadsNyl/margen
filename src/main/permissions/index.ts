import { inProject } from '../projects/inside'

// The one place that decides whether the Agent may use a tool without asking.
// Providers translate their own tool calls into a ToolRequest and turn "ask"
// into an approval-request. Ticket 09 replaces `projectPolicy` with the Editor
// preset and Allow everything.

export type ToolRequest =
  | { kind: 'read' | 'write'; path: string }
  | { kind: 'web' }
  | { kind: 'shell'; command: string }
  | { kind: 'other'; name: string }

export type PermissionDecision = 'allow' | 'ask'

export type PermissionPolicy = (request: ToolRequest) => Promise<PermissionDecision>

/** Reads and writes inside the Project and the web are allowed; shell commands and anything else ask. */
export function projectPolicy(projectDir: string): PermissionPolicy {
  return async (request) => {
    switch (request.kind) {
      case 'read':
      case 'write':
        return inProject(projectDir, request.path) === null ? 'ask' : 'allow'
      case 'web':
        return 'allow'
      default:
        return 'ask'
    }
  }
}
