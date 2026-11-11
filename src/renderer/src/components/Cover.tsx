import { useId, type ReactNode } from 'react'

// Generated cover art, ported from the prototype's cover() (after Margin's
// components/cover-art). The same id always gives the same cover.

const PALETTES = [
  ['#f7d64a', '#f6b48e', '#f4a3b4'],
  ['#f4a3b4', '#d6a6d0', '#b9a4d8'],
  ['#9fd3c7', '#8cbbe6', '#5d9be0'],
  ['#c4ecd2', '#9fd3c7', '#e8e08a'],
  ['#b9a6ff', '#f3a6d0', '#9fb4ff'],
] as const

/** FNV-1a, as in the prototype. */
export function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function shapes(h: number): ReactNode {
  const [a, b, c] = PALETTES[h % 5] ?? PALETTES[0]
  const s = ((h >>> 6) % 60) - 30
  switch ((h >>> 3) % 4) {
    case 0:
      return (
        <>
          <rect x={20 + s} y="80" width="70" height="200" rx="35" fill={a} />
          <rect x={100 + s} y="40" width="70" height="220" rx="35" fill={b} />
          <circle cx={150 - s} cy="60" r="34" fill={c} />
        </>
      )
    case 1:
      return (
        <>
          <path d={`M-20 ${120 + s} Q50 60 110 120 T240 120 V260 H-20Z`} fill={a} />
          <path d={`M-20 ${170 - s} Q60 120 120 170 T240 170 V260 H-20Z`} fill={b} />
          <circle cx="60" cy="60" r="30" fill={c} />
        </>
      )
    case 2:
      return (
        <>
          <circle cx={100 + s} cy="90" r="54" fill={a} />
          <rect x="-10" y="150" width="220" height="30" fill={b} />
          <rect x="-10" y="190" width="220" height="30" fill={c} />
        </>
      )
    default:
      return (
        <>
          <path d={`M-40 ${60 + s} L160 260 L240 260 L40 ${-20 + s}Z`} fill={a} />
          <path d="M40 -20 L240 180 L240 100 L120 -20Z" fill={b} />
          <circle cx="50" cy="200" r="40" fill={c} />
        </>
      )
  }
}

/** A 64px cover with a small badge icon in the corner. */
export function Cover({ id, badge }: { id: string; badge: ReactNode }) {
  const filter = useId()
  return (
    <span className="relative size-16 flex-none" aria-hidden>
      <span className="block size-full overflow-hidden rounded-[14px]">
        <svg viewBox="0 0 200 250" preserveAspectRatio="xMidYMid slice" className="block size-full">
          <defs>
            <filter id={filter}>
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          <rect width="200" height="250" fill="#fbfaf7" />
          <g filter={`url(#${CSS.escape(filter)})`} opacity=".85">
            {shapes(hash(id))}
          </g>
        </svg>
      </span>
      <span className="absolute -right-1.5 -bottom-1.5 grid size-7 place-items-center rounded-[9px] bg-white text-tx shadow-[0_1px_4px_rgba(0,0,0,.12)]">
        {badge}
      </span>
    </span>
  )
}

/** One row in a grid of items (Documents, recent Projects), as on Margin's Workspace page. */
export function ItemRow(props: {
  coverId: string
  badge: ReactNode
  name: string
  dir?: string
  meta: string
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className="flex w-full min-w-0 items-center gap-4 rounded-[14px] p-2 text-left transition enabled:hover:bg-muted/80 disabled:cursor-default disabled:opacity-60"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Cover id={props.coverId} badge={props.badge} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className="truncate text-sm font-normal">{props.name}</b>
        {props.dir && <span className="truncate font-mono text-[10.5px] text-tx3">{props.dir}</span>}
        <small className="truncate text-xs text-tx3">{props.meta}</small>
      </span>
    </button>
  )
}
