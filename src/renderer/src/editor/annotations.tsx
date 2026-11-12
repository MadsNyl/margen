import type { Annotation } from '@shared/agent'
import { formatTime } from '@shared/clock'
import { annotationLabel, useDraft } from './draft'
import { CloseIcon } from '../components/icons'

// Annotations in the chat panel: the Composer's chips for pending ones, and the
// rows in a sent message.

/** The pending Annotations as chips: click one to reopen its comment box, × to drop it. */
export function Chips() {
  const draft = useDraft()
  if (draft.annotations.length === 0) return null
  return (
    <ul aria-label="Annotations" className="flex flex-wrap gap-1.5 px-3 pt-2.5">
      {draft.annotations.map(({ id, annotation }) => (
        <li
          key={id}
          className="chip-pop inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-muted pr-1.5 pl-1 text-[12px] text-tx2 hover:bg-muted2"
        >
          <button aria-label={`Annotation ${annotation.number}`} className="inline-flex min-w-0 items-center gap-1.5" onClick={() => draft.setOpen(id)}>
            <Number n={annotation.number} className="size-5 text-[10px]" />
            <b className="max-w-[150px] truncate font-mono text-[10px] font-normal text-tx">{label(annotation)}</b>
            {annotation.comment && <span className="max-w-[110px] truncate">{annotation.comment}</span>}
          </button>
          <button aria-label={`Remove Annotation ${annotation.number}`} className="grid place-items-center px-[3px] text-tx3 hover:text-tx" onClick={() => draft.remove(id)}>
            <CloseIcon className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** A sent message's Annotations, each with a thumbnail, what it points at, its Viewport width and its comment. */
export function AnnotationRows({ annotations }: { annotations: Annotation[] }) {
  if (annotations.length === 0) return null
  return (
    <ul className="mb-2 flex flex-col gap-1.5 whitespace-normal">
      {annotations.map((annotation) => (
        <li
          key={annotation.number}
          aria-label={`Annotation ${annotation.number}`}
          className="flex items-center gap-2.5 rounded-[11px] bg-muted py-[5px] pr-2.5 pl-[5px]"
        >
          <Number n={annotation.number} className="size-[17px] text-[9.5px]" />
          <Thumbnail annotation={annotation} />
          <span className="min-w-0 text-[12.5px] leading-[1.35]">
            <b className="block truncate font-mono text-[10px] font-normal text-ink-tx">
              {annotation.kind === 'draw' && 'drawing · '}
              {annotationLabel(annotation)} · {annotation.viewportWidth}px
              {annotation.time !== undefined && ` · at ${formatTime(annotation.time)}`}
            </b>
            {annotation.comment || (annotation.kind === 'pick' ? '(no comment)' : '(drawing)')}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Thumbnail({ annotation }: { annotation: Annotation }) {
  const frame = 'h-9 w-[52px] flex-none rounded-[7px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.05)]'
  if (annotation.crop) return <img src={annotation.crop} alt="" className={`${frame} object-contain`} />
  const tag = annotation.kind === 'pick' ? annotation.tag : '✎'
  return <span className={`${frame} grid place-items-center font-mono text-[10px] text-ink-tx`}>{tag}</span>
}

const label = (annotation: Annotation) => (annotation.kind === 'draw' ? `✎ ${annotationLabel(annotation)}` : annotationLabel(annotation))

function Number({ n, className }: { n: number; className: string }) {
  return <span className={`grid flex-none place-items-center rounded-full bg-ink font-semibold text-white ${className}`}>{n}</span>
}
