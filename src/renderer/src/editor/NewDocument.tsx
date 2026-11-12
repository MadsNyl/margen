import { useEffect, useState } from 'react'
import { host } from '../host'
import { useLeave } from './leave'

/**
 * The switcher's New Document: describe it, and the Agent names a new file,
 * opens it and starts making it. Leaving a running Turn asks first, as any switch does.
 */
export function NewDocumentDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [creating, setCreating] = useState(false)
  const [failed, setFailed] = useState<string>()
  const leave = useLeave()

  // Escape closes the dialog and does nothing else (it doesn't stop a Turn).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const create = () => {
    const description = text.trim()
    if (!description || creating) return
    leave(() => {
      setCreating(true)
      setFailed(undefined)
      return host.call('project.newDocument', description).then(onClose, (error: unknown) => {
        setCreating(false)
        setFailed(error instanceof Error ? error.message : String(error))
      })
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,17,17,.18)] backdrop-blur-[2px]"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal
        aria-labelledby="new-document-title"
        className="modal-in w-[460px] rounded-[18px] bg-white px-5 pt-[18px] pb-3.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,.35),0_0_0_1px_rgba(0,0,0,.06)]"
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        <h2 id="new-document-title" className="m-0 text-[15px] font-medium">
          New Document
        </h2>
        <p className="mt-1 mb-3 text-[13px] text-tx2">Describe what to make. Claude names the file and starts on it.</p>
        <textarea
          autoFocus
          aria-label="Describe the new Document"
          placeholder="A price list for the café, with this season's drinks…"
          value={text}
          disabled={creating}
          rows={5}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              create()
            }
          }}
          className="block w-full resize-none rounded-xl border border-line bg-shell px-3 py-2.5 text-[13.5px] leading-[1.55] outline-0 placeholder:text-tx3 focus:border-border focus:bg-white"
        />
        {failed && (
          <p role="alert" className="mt-2 mb-0 text-[12.5px] text-tx2">
            {failed}
          </p>
        )}
        <div className="mt-3 flex items-center justify-end gap-1.5">
          {creating && <span className="mr-auto shimmer text-[12.5px]">Naming it…</span>}
          <button type="button" className="sbtn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="sbtn sbtn-go" disabled={!text.trim() || creating}>
            Create
          </button>
        </div>
      </form>
    </div>
  )
}
