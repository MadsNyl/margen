import { useEffect, useRef, useState, type ReactNode } from 'react'

/** A dropdown's open state, closed again by Escape or a click outside the returned ref's element. */
export function useDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) {
        // Taken: Esc closes the menu and does nothing else (it doesn't stop a Turn).
        event.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return { open, setOpen, ref }
}

export function Menu({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      role="menu"
      className={`absolute z-20 rounded-xl border border-line bg-white p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,.2)] ${className}`}
    >
      {children}
    </div>
  )
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <h6 className="m-0 px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-tx3">{children}</h6>
}

export function MenuItem({ children, current, onClick }: { children: ReactNode; current?: boolean; onClick: () => void }) {
  return (
    <button
      role="menuitem"
      aria-current={current || undefined}
      className={`flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] hover:bg-muted ${current ? 'bg-muted font-medium' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
