import { useEffect, type ReactNode } from 'react'

/**
 * A centred dialog over a soft, blurred backdrop. Escape or a click outside
 * closes it; Escape does nothing else (it doesn't stop a Turn).
 */
export function Dialog({ label, onClose, className, children }: { label: string; onClose: () => void; className: string; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,17,17,.18)] backdrop-blur-[2px]"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={label}
        className={`modal-in max-w-[calc(100vw-48px)] rounded-[26px] border border-line bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,.35),0_0_0_1px_rgba(0,0,0,.04)] ${className}`}
      >
        {children}
      </div>
    </div>
  )
}
