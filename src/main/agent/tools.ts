import type { z } from 'zod'

// Margen's own tools for the Agent: the place to add one. Each is defined
// here, provider-free, and handed to a Session (`StartSessionOptions.tools`);
// the Claude Code adapter serves them from one in-process MCP server named
// `margen` (`claude/tools.ts`), so Claude Code sees `mcp__margen__<name>`.
// Margen's tools run without asking: they only read and measure.

export interface AgentToolResult {
  /** What the Agent reads back. */
  text: string
  /** The call failed; `text` says why. */
  error?: boolean
}

export interface AgentTool<Input extends z.ZodRawShape = z.ZodRawShape> {
  /** snake_case, unique among Margen's tools. */
  name: string
  /** What it does and when to call it, for the Agent. */
  description: string
  /** Its arguments, as zod fields. */
  input: Input
  run(input: z.infer<z.ZodObject<Input>>): Promise<AgentToolResult>
}

/** Keeps a tool's `run` typed by its `input` while it's listed with others. */
export function defineTool<Input extends z.ZodRawShape>(tool: AgentTool<Input>): AgentTool {
  return tool as unknown as AgentTool
}

/** The prefix Margen's tools have in Claude Code: `mcp__margen__narration_lengths`. */
export const MARGEN_SERVER = 'margen'
