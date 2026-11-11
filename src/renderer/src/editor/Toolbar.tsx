import type { ReactNode } from 'react'
import type { Mode } from '@shared/document-bridge'

// The floating toolbar: a dark pill at the bottom of the stage with one button
// per Mode.

const HINTS: Partial<Record<Mode, string>> = {
  pick: 'Hover or use the arrow keys to move between elements. Click or ↵ to pick',
  draw: 'Draw anything: circle what you mean, or sketch what you want. Then add a comment',
}

const TOOLS: { mode: Mode; label: string; key: string; tip: string; icon: ReactNode }[] = [
  {
    mode: 'browse',
    label: 'Browse',
    key: 'V',
    tip: 'Browse: use the page normally',
    icon: <path d="M5 3l11 5.5-4.8 1.3L9.5 15z" />,
  },
  {
    mode: 'pick',
    label: 'Pick',
    key: 'P',
    tip: 'Pick: click an element, or move with the arrow keys',
    icon: (
      <>
        <rect x="2.5" y="2.5" width="10" height="10" rx="1.5" strokeDasharray="2.2 2" />
        <path d="M10 10l7.5 3-3 1.2L13 17.5z" />
      </>
    ),
  },
  {
    mode: 'draw',
    label: 'Draw',
    key: 'D',
    tip: 'Draw: circle, scribble or sketch, then say what you want',
    icon: <path d="M10.5 4.5C6 4 2.5 6 2.8 9s4 4.8 8.2 4.4 6.8-2.6 6.2-5.3C16.7 6 13.2 3.8 8 4.6" />,
  },
]

/** While Pick moves by the arrow keys: which key does what. */
const KEY_GUIDE: [string, string][] = [
  ['↑', 'parent'],
  ['↓', 'child'],
  ['← →', 'previous / next'],
  ['↵', 'pick'],
  ['esc', 'done'],
]

export function Toolbar({ mode, onMode, keyGuide }: { mode: Mode; onMode: (mode: Mode) => void; keyGuide?: boolean }) {
  const hint = HINTS[mode]
  return (
    <>
      {keyGuide && (
        <div
          role="note"
          aria-label="Keys"
          className="pointer-events-none absolute bottom-20 left-1/2 z-19 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] whitespace-nowrap text-tx2 shadow-[0_4px_16px_-4px_rgba(0,0,0,.15)]"
        >
          {KEY_GUIDE.map(([keys, action]) => (
            <span key={action} className="flex items-center gap-1.5">
              {keys.split(' ').map((key) => (
                <kbd key={key} className="ml-1">
                  {key}
                </kbd>
              ))}
              {action}
            </span>
          ))}
        </div>
      )}
      {hint && !keyGuide && (
        <div
          key={mode}
          className="mode-hint pointer-events-none absolute bottom-20 left-1/2 z-19 -translate-x-1/2 rounded-full bg-white px-3.5 py-[7px] text-[12.5px] whitespace-nowrap text-tx2 shadow-[0_4px_16px_-4px_rgba(0,0,0,.15)]"
        >
          {hint}
        </div>
      )}
      <div
        role="toolbar"
        aria-label="Mode"
        className="absolute bottom-[22px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-[3px] rounded-full bg-primary p-1.5 text-white shadow-[0_18px_40px_-10px_rgba(0,0,0,.45),0_0_0_1px_rgba(255,255,255,.08)]"
      >
        {TOOLS.map((tool) => {
          const on = tool.mode === mode
          const colours = !on
            ? ''
            : tool.mode === 'browse'
              ? 'bg-white text-[#111] hover:bg-white hover:text-[#111] [&_kbd]:border-[#ddd] [&_kbd]:text-[#888]'
              : 'bg-ink text-white hover:bg-ink [&_kbd]:border-white/40 [&_kbd]:text-white/85'
          return (
            <button
              key={tool.mode}
              aria-label={tool.label}
              aria-pressed={on}
              className={`tool group ${colours}`}
              onClick={() => onMode(tool.mode)}
            >
              <svg viewBox="0 0 20 20" className="size-4 flex-none fill-none stroke-current" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {tool.icon}
              </svg>
              {on && <span>{tool.label}</span>}
              <kbd>{tool.key}</kbd>
              <span className="pointer-events-none absolute bottom-[50px] left-1/2 -translate-x-1/2 rounded-[7px] bg-primary px-[9px] py-[5px] text-[11.5px] font-normal whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100">
                {tool.tip}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}
