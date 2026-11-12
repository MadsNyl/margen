import type { Attachment } from '@shared/agent'
import { AttachIcon, CloseIcon } from '../components/icons'

/** Attached files as chips: the file's name, its path on hover, and × to drop it when `onRemove` is given. */
export function AttachmentChips({ files, onRemove }: { files: Attachment[]; onRemove?: (path: string) => void }) {
  return (
    <ul aria-label="Attachments" className="m-0 flex list-none flex-wrap gap-1.5 p-0 whitespace-normal">
      {files.map((file) => (
        <li
          key={file.path}
          title={file.path}
          className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-muted pl-2.5 text-[12px] text-tx2 ${onRemove ? 'pr-1.5' : 'pr-2.5'}`}
        >
          <AttachIcon className="size-3.5 text-tx3" />
          <span className="max-w-[220px] truncate text-tx">{file.name}</span>
          {onRemove && (
            <button type="button" aria-label={`Remove ${file.name}`} className="grid place-items-center px-[3px] text-tx3 hover:text-tx" onClick={() => onRemove(file.path)}>
              <CloseIcon className="size-3" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
