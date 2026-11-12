import { useState } from 'react'
import type { ToolEvent } from '@shared/agent'
import { ChevronRightIcon } from '../components/icons'

// What the Agent did between two pieces of its reply, as one muted line that
// opens into a timeline of its tool calls. The run in progress stays open and
// says Thinking or Working; once the Agent moves on it folds into a summary.

export type Step = { kind: 'thinking' } | { kind: 'tool'; tool: ToolEvent }

export function Activity({ steps, active }: { steps: Step[]; active: boolean }) {
  const [toggled, setToggled] = useState<boolean>()
  const tools = steps.flatMap((step) => (step.kind === 'tool' ? [step.tool] : []))
  const open = (toggled ?? active) && tools.length > 0
  const label = active ? (steps.at(-1)?.kind === 'thinking' ? 'Thinking' : 'Working') : summary(tools)

  return (
    <div role="group" aria-label="Activity" className="my-1.5 text-[12.5px] text-tx3">
      <button
        aria-expanded={open}
        disabled={tools.length === 0}
        onClick={() => setToggled(!open)}
        className="group inline-flex items-center gap-1.5 hover:text-tx2 disabled:hover:text-tx3"
      >
        {active ? <span className="shimmer">{label}</span> : label}
        {tools.length > 0 && (
          <ChevronRightIcon className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        )}
      </button>
      {open && (
        <ol className="mt-1 ml-[3px] border-l border-line pl-3">
          {tools.map((tool, i) => (
            <ToolStep key={tool.id ?? i} tool={tool} />
          ))}
        </ol>
      )}
    </div>
  )
}

const VERB: Record<ToolEvent['tool'], [running: string, done: string]> = {
  read: ['Reading', 'Read'],
  edit: ['Editing', 'Edited'],
  write: ['Writing', 'Wrote'],
  shell: ['Running', 'Ran'],
  search: ['Searching', 'Searched'],
  web: ['Fetching', 'Fetched'],
  other: ['Using', 'Used'],
}

function ToolStep({ tool }: { tool: ToolEvent }) {
  const running = tool.status === 'running'
  const verb = VERB[tool.tool][running ? 0 : 1]
  const target = 'file' in tool ? tool.file : tool.tool === 'other' ? tool.name : tool.detail
  return (
    <li className="relative flex min-w-0 items-baseline gap-1.5 py-[3px] leading-[1.45]">
      <span className="absolute top-[9px] -left-[15.5px] size-[5px] rounded-full bg-tx3/60" aria-hidden />
      <span className={`flex-none ${running ? 'shimmer' : 'text-tx2'}`}>{verb}</span>
      <span className="min-w-0 truncate font-mono text-[11px]" title={target}>
        {target}
      </span>
      {tool.status === 'failed' && <span className="flex-none">· failed</span>}
      {'file' in tool && tool.added !== undefined && (
        <span className="flex-none font-mono text-[11px] text-mint-strong">+{tool.added}</span>
      )}
      {'file' in tool && tool.removed !== undefined && tool.removed > 0 && (
        <span className="flex-none font-mono text-[11px] text-ink-tx">−{tool.removed}</span>
      )}
    </li>
  )
}

const NOUN: Record<ToolEvent['tool'], [one: string, many: string]> = {
  read: ['file', 'files'],
  edit: ['file', 'files'],
  write: ['file', 'files'],
  shell: ['command', 'commands'],
  search: ['search', 'searches'],
  web: ['link', 'links'],
  other: ['tool', 'tools'],
}

/** "Read 2 files, ran 1 command", in the order the Agent first did each. */
export function summary(tools: ToolEvent[]): string {
  if (tools.length === 0) return 'Thought'
  const counts = new Map<ToolEvent['tool'], number>()
  for (const tool of tools) counts.set(tool.tool, (counts.get(tool.tool) ?? 0) + 1)
  const text = [...counts]
    .map(([kind, n]) => {
      const verb = kind === 'search' ? 'ran' : VERB[kind][1].toLowerCase()
      return `${verb} ${n} ${NOUN[kind][n === 1 ? 0 : 1]}`
    })
    .join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
