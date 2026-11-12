import { createContext, useContext, useEffect, useState, type RefObject } from 'react'
import { SCREENS, VIEWPORTS, viewportOf, type Viewport, type ViewportChoice } from '@shared/viewport'
import { Menu, MenuHeading, MenuItem, useDropdown } from '../components/Menu'
import { ChevronDownIcon, DesktopIcon, FitIcon, MobileIcon, TabletIcon } from '../components/icons'

const ViewportContext = createContext<Viewport | null>(null)

export const ViewportProvider = ViewportContext.Provider

/** The Viewport the Document is shown at, for anything inside the editor (Annotations record it). */
export function useViewport(): Viewport {
  const viewport = useContext(ViewportContext)
  if (!viewport) throw new Error('useViewport is only for inside the editor')
  return viewport
}

/** The CSS width of the frame around the Document view for a choice. */
export function frameWidth(choice: ViewportChoice): string {
  const { width } = VIEWPORTS[choice]
  return width === null ? '100%' : `${width}px`
}

/** The Viewport for a choice, following the frame's size as the window resizes. */
export function useMeasuredViewport(choice: ViewportChoice, frame: RefObject<HTMLElement | null>, fit = false): Viewport {
  const [measured, setMeasured] = useState(0)

  useEffect(() => {
    const el = frame.current
    if (!el) return
    const observer = new ResizeObserver(() => setMeasured(el.getBoundingClientRect().width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [frame])

  return viewportOf(choice, measured, fit)
}

/** The room inside an element (its content box), following it as the window resizes. */
export function useRoom(element: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [room, setRoom] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = element.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRoom({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [element])
  return room
}

/** Next to the Viewport select: lays the Document out at a whole screen and scales it to fit, or shows it at actual size. */
export function FitButton({ fit, scale, onFit }: { fit: boolean; scale: number; onFit: (fit: boolean) => void }) {
  return (
    <button
      aria-label="Fit to window"
      aria-pressed={fit}
      title={fit ? 'Fitted: a whole screen, scaled to the window. Click for actual size' : 'Fit a whole screen to the window (for slide decks and full-screen pages)'}
      onClick={() => onFit(!fit)}
      className={`inline-flex h-[30px] items-center gap-1.5 rounded-full border px-2.5 text-[13px] ${fit ? 'border-ink/30 bg-ink-soft text-ink-tx' : 'border-line bg-white text-tx2 hover:bg-muted hover:text-tx'}`}
    >
      <FitIcon />
      {fit && <span className="text-xs tabular-nums">{Math.round(scale * 100)}%</span>}
    </button>
  )
}

const ICONS = { desktop: DesktopIcon, tablet: TabletIcon, mobile: MobileIcon }

/** The top bar's Viewport select: the current Viewport and its width, and a menu of the others. */
export function ViewportSelect({
  choice,
  viewport,
  fit,
  onChoose,
}: {
  choice: ViewportChoice
  viewport: Viewport
  fit: boolean
  onChoose: (choice: ViewportChoice) => void
}) {
  const { open, setOpen, ref } = useDropdown()
  const CurrentIcon = ICONS[choice]

  return (
    <div ref={ref} className="relative">
      <button
        className="inline-flex h-[30px] items-center gap-[7px] rounded-full border border-line bg-white px-2.5 text-[13px] hover:bg-muted"
        title="Viewport"
        aria-label="Viewport"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <CurrentIcon />
        <span>{viewport.name}</span>
        <span className="text-xs text-tx3 tabular-nums">{viewport.width}px</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <Menu className="top-9 right-0 min-w-[210px]">
          <MenuHeading>Viewport</MenuHeading>
          {(Object.keys(VIEWPORTS) as ViewportChoice[]).map((key) => {
            const Icon = ICONS[key]
            const { name, width } = VIEWPORTS[key]
            return (
              <MenuItem
                key={key}
                current={key === choice}
                onClick={() => {
                  setOpen(false)
                  onChoose(key)
                }}
              >
                <span className="inline-flex items-center gap-[9px]">
                  <Icon />
                  {name}
                </span>
                <small className="ml-auto text-[11.5px] font-normal text-tx3">
                  {fit ? `${SCREENS[key].width}×${SCREENS[key].height}` : width === null ? 'fits the window' : `${width}px`}
                </small>
              </MenuItem>
            )
          })}
        </Menu>
      )}
    </div>
  )
}
