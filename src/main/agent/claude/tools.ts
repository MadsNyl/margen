import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import { MARGEN_SERVER, type AgentTool } from '../tools'

// Margen's tools (`../tools.ts`) as Claude Code sees them: one in-process MCP
// server, `margen`, run by the Agent SDK inside Margen's main process. A
// server connects to one `claude`, so each run of `claude` gets a new one.

/** What Claude Code calls Margen's tool `name`. */
export const margenToolName = (name: string) => `mcp__${MARGEN_SERVER}__${name}`

/** Margen's tool a Claude Code tool name is, if it's one: `mcp__margen__narration_lengths` → `narration_lengths`. */
export function margenTool(toolName: string): string | undefined {
  const prefix = margenToolName('')
  return toolName.startsWith(prefix) ? toolName.slice(prefix.length) : undefined
}

export function margenServer(tools: AgentTool[]): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: MARGEN_SERVER,
    version: '1.0.0',
    // Few and small: always in the prompt rather than behind tool search.
    alwaysLoad: true,
    tools: tools.map((definition) =>
      tool(definition.name, definition.description, definition.input, async (input) => {
        const result = await definition.run(input).catch((error: unknown) => ({ text: error instanceof Error ? error.message : String(error), error: true }))
        return { content: [{ type: 'text', text: result.text }], ...(result.error && { isError: true }) }
      }),
    ),
  })
}
