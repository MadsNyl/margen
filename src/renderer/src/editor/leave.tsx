import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { host } from '../host'

// Leaving the open Document's Session (for another Document or Session, or
// back to the Project or Start) closes its Agent, which stops a running Turn.
// So while a Turn runs, the editor asks first. A link in the Document to
// another Document comes here too.

type Leave = (go: () => unknown) => void

const LeaveContext = createContext<Leave>((go) => void go())

/** Runs `go` (which switches away from the Session) now, or after asking while a Turn runs. */
export function useLeave(): Leave {
  return useContext(LeaveContext)
}

export function LeaveGuard({ children }: { children: ReactNode }) {
  const [asking, setAsking] = useState<(() => unknown) | null>(null)
  const leave = useCallback<Leave>((go) => {
    void host.call('session.running').then(
      (running) => (running ? setAsking(() => go) : void go()),
      () => void go(),
    )
  }, [])

  useEffect(() => host.on('document.link', ({ path }) => leave(() => host.call('document.open', path).catch(() => {}))), [leave])

  return (
    <LeaveContext.Provider value={leave}>
      {children}
      {asking && (
        <AskDialog
          onCancel={() => setAsking(null)}
          onStop={() => {
            setAsking(null)
            void asking()
          }}
        />
      )}
    </LeaveContext.Provider>
  )
}

function AskDialog({ onCancel, onStop }: { onCancel: () => void; onStop: () => void }) {
  // Escape cancels and does nothing else (it doesn't stop the Turn).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,17,17,.18)] backdrop-blur-[2px]"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal
        aria-labelledby="leave-title"
        aria-describedby="leave-detail"
        className="modal-in w-[360px] rounded-[18px] bg-white px-5 pt-[18px] pb-3.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,.35),0_0_0_1px_rgba(0,0,0,.06)]"
      >
        <h2 id="leave-title" className="m-0 text-[15px] font-medium">
          A Turn is running.
        </h2>
        <p id="leave-detail" className="mt-1 mb-4 text-[13px] text-tx2">
          Stop it and switch?
        </p>
        <div className="flex justify-end gap-1.5">
          <button autoFocus className="sbtn" onClick={onCancel}>
            Cancel
          </button>
          <button className="sbtn sbtn-go" onClick={onStop}>
            Stop and switch
          </button>
        </div>
      </div>
    </div>
  )
}
