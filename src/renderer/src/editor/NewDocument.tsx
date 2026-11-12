import { useRef, useState } from 'react'
import type { Attachment } from '@shared/agent'
import { DEFAULT_FRAME, FRAME_SIZES, type FrameSizeId, type TemplateChoice, type TemplateInfo } from '@shared/templates'
import { Dialog } from '../components/Dialog'
import { TemplateChip, useMentions } from '../components/Mentions'
import { ArrowUpIcon, AttachIcon, MicIcon, TemplateIcon } from '../components/icons'
import { errorMessage, host, useHostValue } from '../host'
import { AttachmentChips } from './attachments'
import { useLeave } from './leave'

/**
 * The switcher's New Document, and a Template card's dialog on the Project page:
 * the Project page's chat bar as a dialog, with room to write, files to attach,
 * `@` for Documents and Templates and, for an Animation video, the frame size.
 * The Agent names a new file, opens it and starts making it. Leaving a running
 * Turn asks first, as any switch does.
 */
export function NewDocumentDialog({ onClose, template: card }: { onClose: () => void; template?: TemplateInfo }) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [template, setTemplate] = useState<TemplateInfo | null>(card ?? null)
  const [frame, setFrame] = useState<FrameSizeId>(DEFAULT_FRAME)
  const [creating, setCreating] = useState(false)
  const [failed, setFailed] = useState<string>()
  const leave = useLeave()
  const field = useRef<HTMLTextAreaElement>(null)
  const documents = useHostValue('documents.list', 'documents.changed')?.documents ?? []
  const mentions = useMentions({ id: 'new-document-mentions', text, setText, documents, onTemplate: setTemplate, field })

  const attach = () =>
    void host
      .call('files.pick')
      .then((chosen) => setFiles((had) => [...had, ...chosen.filter((file) => !had.some((h) => h.path === file.path))]))
      .catch(() => {})

  const create = () => {
    const description = text.trim()
    if (!description || creating) return
    const choice: TemplateChoice | undefined = template
      ? { template: template.id, ...(template.id === 'animation-video' && { frame }) }
      : undefined
    leave(() => {
      setCreating(true)
      setFailed(undefined)
      return host.call('project.newDocument', description, files, choice).then(onClose, (error: unknown) => {
        setCreating(false)
        setFailed(errorMessage(error))
      })
    })
  }

  return (
    <Dialog label={card?.name ?? 'New Document'} onClose={onClose} className="w-[620px]">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        {card && template && (
          // A card's Template; an `@` Template chosen here takes its place.
          <h2 className="m-0 flex items-center gap-2 px-5 pt-4 text-[13px] font-medium text-tx2">
            <TemplateIcon template={template.id} className="size-4" />
            {template.name}
          </h2>
        )}
        {template && !card && (
          <div className="px-4 pt-3">
            <TemplateChip template={template} onRemove={() => setTemplate(null)} />
          </div>
        )}
        <textarea
          ref={field}
          autoFocus
          aria-label="Describe the new Document"
          placeholder={template && template.id !== 'blank' ? `Describe the ${template.name.toLowerCase()}…` : 'Describe a new Document…'}
          value={text}
          disabled={creating}
          rows={4}
          {...mentions.fieldProps}
          onKeyDown={(event) => {
            if (mentions.onKeyDown(event)) return
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              create()
            }
          }}
          className="block max-h-[40vh] min-h-[112px] w-full resize-none border-0 bg-transparent px-5 pt-4 pb-2 text-[14.5px] leading-[1.55] outline-0 placeholder:text-tx3"
        />
        {mentions.popover && <div className="absolute top-[72px] left-4 z-20">{mentions.popover}</div>}
        {template?.id === 'animation-video' && <FramePicker frame={frame} onChange={setFrame} disabled={creating} />}
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

/** An Animation video's frame size: each choice drawn as its shape. */
function FramePicker({ frame, onChange, disabled }: { frame: FrameSizeId; onChange: (frame: FrameSizeId) => void; disabled: boolean }) {
  return (
    <div role="radiogroup" aria-label="Frame size" className="flex gap-1.5 px-4 pb-2">
      {(Object.keys(FRAME_SIZES) as FrameSizeId[]).map((id) => {
        const { width, height } = FRAME_SIZES[id]
        const checked = id === frame
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${id} ${width}×${height}`}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={`flex h-9 items-center gap-2 rounded-full border px-3 text-[12.5px] ${checked ? 'border-primary text-tx' : 'border-line text-tx2 hover:bg-muted'}`}
          >
            <span
              aria-hidden
              className={`block rounded-[2px] border-[1.5px] ${checked ? 'border-primary' : 'border-tx3'}`}
              style={{ width: Math.round((16 * width) / Math.max(width, height)), height: Math.round((16 * height) / Math.max(width, height)) }}
            />
            {id}
            <small className="text-[11px] text-tx3">
              {width}×{height}
            </small>
          </button>
        )
      })}
    </div>
  )
}
