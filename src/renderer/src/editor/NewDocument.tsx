import { useState } from 'react'
import type { Attachment } from '@shared/agent'
import { Dialog } from '../components/Dialog'
import { ArrowUpIcon, AttachIcon, MicIcon } from '../components/icons'
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
    <Dialog label="New Document" onClose={onClose} className="w-[620px]">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
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
          className="block max-h-[40vh] min-h-[112px] w-full resize-none border-0 bg-transparent px-5 pt-4 pb-2 text-[14.5px] leading-[1.55] outline-0 placeholder:text-tx3"
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
    </Dialog>
  )
}
