import { useEffect, useState } from 'react'
import { Menu, MenuItem, useDropdown } from '../components/Menu'
import { ChevronDownIcon, CloseIcon, ExportIcon, PdfIcon, VideoIcon } from '../components/icons'
import { errorMessage, host } from '../host'

// Export in the top bar, a menu of what the Document's Template exports to: an
// Animation video to MP4, a Poster or Slides to PDF. Main asks where to save it,
// then makes the file from the Document loaded again in a window of its own (an
// MP4 frame by frame), so the editor's view and its paused time are left as they are.

/** What a Document exports to. */
export type ExportFormat = 'mp4' | 'pdf'

const FORMATS = {
  mp4: { label: 'MP4 video', Icon: VideoIcon, call: 'video.export' },
  pdf: { label: 'PDF', Icon: PdfIcon, call: 'document.exportPdf' },
} as const

const NOTICE_MS = 4000

type Export =
  | { state: 'idle' }
  /** The Save dialog is open, or (a PDF) it's printing. */
  | { state: 'asking' }
  | { state: 'exporting'; frame: number; frames: number }
  | { state: 'saved'; path: string }
  | { state: 'failed'; message: string }

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path

/** `ready`: the page can be exported (an Animation video's clock has reported). */
export function ExportMenu({ formats, ready }: { formats: readonly ExportFormat[]; ready: boolean }) {
  const [run, setRun] = useState<Export>({ state: 'idle' })
  const { open, setOpen, ref } = useDropdown()

  useEffect(
    () => host.on('video.exportProgress', ({ frame, frames }) => setRun((now) => (now.state === 'asking' || now.state === 'exporting' ? { state: 'exporting', frame, frames } : now))),
    [],
  )
  useEffect(() => {
    if (run.state !== 'saved' && run.state !== 'failed') return
    const timer = setTimeout(() => setRun({ state: 'idle' }), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [run])

  function start(format: ExportFormat) {
    setOpen(false)
    setRun({ state: 'asking' })
    host.call(FORMATS[format].call).then(
      (path) => setRun(path ? { state: 'saved', path } : { state: 'idle' }),
      (error: unknown) => setRun({ state: 'failed', message: errorMessage(error) }),
    )
  }

  if (run.state === 'exporting') {
    const percent = run.frames ? Math.floor((run.frame / run.frames) * 100) : 0
    return (
      <div className="flex h-7 items-center gap-2 rounded-[7px] pr-0.5 pl-2.5 text-xs text-tx2">
        <span>Exporting</span>
        <div
          role="progressbar"
          aria-label="Export"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1 w-20 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-tx transition-[width] duration-150" style={{ width: `${percent}%` }} />
        </div>
        <span className="w-8 font-mono tabular-nums">{percent}%</span>
        <button
          className="grid size-6 place-items-center rounded-[6px] hover:bg-black/4 hover:text-tx"
          title="Cancel export"
          aria-label="Cancel export"
          onClick={() => void host.call('video.cancelExport')}
        >
          <CloseIcon className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          className="inline-flex h-7 items-center gap-1.5 rounded-[7px] px-[9px] text-[13px] text-tx2 hover:bg-black/4 hover:text-tx disabled:text-tx3 disabled:hover:bg-transparent"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={!ready || run.state === 'asking'}
          onClick={() => setOpen(!open)}
        >
          <ExportIcon />
          {run.state === 'asking' ? 'Exporting…' : 'Export'}
          <ChevronDownIcon />
        </button>
        {open && (
          <Menu className="top-9 right-0 w-44">
            {formats.map((format) => {
              const { label, Icon } = FORMATS[format]
              return (
                <MenuItem key={format} onClick={() => start(format)}>
                  <Icon className="size-4 text-tx2" />
                  {label}
                </MenuItem>
              )
            })}
          </Menu>
        )}
      </div>
      {(run.state === 'saved' || run.state === 'failed') && (
        <div
          role={run.state === 'saved' ? 'status' : 'alert'}
          className="notice-in pointer-events-none absolute top-[calc(100%+14px)] left-1/2 z-21 flex max-w-[80%] -translate-x-1/2 items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] text-tx2 shadow-[0_4px_16px_-4px_rgba(0,0,0,.15)]"
        >
          <span className={`size-1.5 flex-none rounded-full ${run.state === 'saved' ? 'bg-mint-strong' : 'bg-[#e5484d]'}`} />
          <span className="truncate">{run.state === 'saved' ? `Exported ${fileName(run.path)}` : `Export failed: ${run.message}`}</span>
        </div>
      )}
    </>
  )
}
