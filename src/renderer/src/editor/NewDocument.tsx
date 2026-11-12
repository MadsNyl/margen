import { useEffect, useState } from 'react'
import type { Attachment } from '@shared/agent'
import { ArrowUpIcon, AttachIcon, CloseIcon, MicIcon } from '../components/icons'
import { host } from '../host'
import { AttachmentChips } from './attachments'
import { useLeave } from './leave'

/**
 * The switcher's New Document: the Project page's chat bar as a dialog, with
 * room to write and files to attach. The Agent names a new file, opens it and
 * starts making it. Leaving a running Turn asks first, as any switch does.
 */
export function NewDocumentDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
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

  const attach = () =>
    void host
      .call('files.pick')
      .then((chosen) => setFiles((had) => [...had, ...chosen.filter((file) => !had.some((h) => h.path === file.path))]))
      .catch(() => {})

  const create = () => {
    const description = text.trim()
    if (!description || creating) return
    leave(() => {
      setCreating(true)
      setFailed(undefined)
      return host.call('project.newDocument', description, files).then(onClose, (error: unknown) => {
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
        aria-label="New Document"
        className="modal-in w-[620px] max-w-[calc(100vw-48px)] rounded-[26px] border border-line bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,.35),0_0_0_1px_rgba(0,0,0,.04)]"
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        <div className="flex items-center gap-2 pt-3.5 pr-3 pl-5 text-[12.5px] text-tx3">
          New Document · Claude names the file
          <button type="button" className="icon-btn ml-auto size-7" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <CloseIcon className="size-3.5" />
          </button>
        </div>
        <textarea
          autoFocus
          aria-label="Describe the new Document"
          placeholder="Describe a new Document…"
          value={text}
          disabled={creating}
          rows={4}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              create()
            }
          }}
          className="block max-h-[40vh] min-h-[96px] w-full resize-none border-0 bg-transparent px-5 pt-1.5 pb-2 text-[14.5px] leading-[1.55] outline-0 placeholder:text-tx3"
        />
        {files.length > 0 && (
          <div className="px-4 pb-1">
            <AttachmentChips files={files} onRemove={(path) => setFiles((had) => had.filter((file) => file.path !== path))} />
          </div>
        )}
        {failed && (
          <p role="alert" className="m-0 px-5 pb-1 text-[12.5px] text-tx2">
            {failed}
          </p>
        )}
        <div className="flex items-center gap-0.5 px-3 pb-3">
          <button type="button" className="icon-btn rounded-full" title="Attach files" aria-label="Attach files" disabled={creating} onClick={attach}>
            <AttachIcon />
          </button>
          <span className="flex-1" />
          {creating && <span className="mr-2 shimmer text-[12.5px]">Naming it…</span>}
          <button type="button" className="icon-btn rounded-full" title="Voice" aria-label="Voice">
            <MicIcon />
          </button>
          <button
            type="submit"
            className="grid size-8 flex-none place-items-center rounded-full bg-primary text-white disabled:cursor-default disabled:bg-[#d4d4d8]"
            title="Create (↵)"
            aria-label="Create"
            disabled={!text.trim() || creating}
          >
            <ArrowUpIcon />
          </button>
        </div>
      </form>
    </div>
  )
}
