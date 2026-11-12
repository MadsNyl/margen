import { useEffect, useMemo, useRef, useState } from 'react'
import { narrationSchedule } from '@shared/narration'
import type { OpenDocument, VideoNarration } from '@shared/host-api'
import type { VoicePack } from '@shared/voices'
import { Menu, MenuHeading, MenuItem, useDropdown } from '../components/Menu'
import { ChevronDownIcon, DownloadIcon, VoiceIcon } from '../components/icons'
import { errorMessage, host, useHostValue } from '../host'
import type { DocumentBridge } from './bridge'

// An Animation video's narration in the editor: its Voice, chosen from the top
// bar (written into the file as `margen-voice`), and its lines spoken with it
// (main caches them) and played in step with the page's clock. Play starts
// each line still to come at its time, partway through one the clock is in;
// pause, a reload and a jump of the clock stop them and start them again from
// where the clock says.

/** How far the audio may be from the clock before it's started again from the clock's time (a seek, a stall). */
const DRIFT = 0.25

export interface Narration {
  /** As the file says now; left out until it's been read. */
  narration?: VideoNarration
  packs?: VoicePack[]
  /** The pack holding the video's Voice, if Margen knows the Voice. */
  pack?: VoicePack
}

/** The open video's narration, spoken and played with the clock the page's script reports over `bridge`. */
export function useNarration(bridge: DocumentBridge | null, video: boolean, document: OpenDocument): Narration {
  const [read, setRead] = useState<{ url: string; narration: VideoNarration }>()
  const packs = useHostValue('voices.list', 'voices.changed')

  // Read again whenever the file changes, as the view reloads.
  useEffect(() => {
    if (!video) return
    let live = true
    const load = () =>
      host.call('video.narration').then(
        (narration) => live && setRead({ url: document.url, narration }),
        () => {},
      )
    void load()
    const off = host.on('document.updated', ({ path }) => path === document.path && void load())
    return () => {
      live = false
      off()
    }
  }, [video, document.url, document.path])

  const narration = read?.url === document.url ? read.narration : undefined
  const voice = narration?.voice
  const pack = voice ? packs?.find((p) => p.voices.some((v) => v.id === voice)) : undefined
  const installed = pack?.state.state === 'installed'
  const audio = useLineAudio(video && installed ? voice : undefined, narration?.lines)
  usePlayback(bridge, video, audio)

  return { ...(narration && { narration }), ...(packs && { packs }), ...(pack && { pack }) }
}

interface LineAudio {
  start: number
  duration: number
  buffer: AudioBuffer
}

/** One AudioContext for the editor's narration, made on first use. */
let context: AudioContext | undefined
const audioContext = () => (context ??= new AudioContext())

/** Each line spoken with `voice` and decoded, as it arrives; `undefined` for one not spoken yet. Kept across reloads by Voice and text. */
function useLineAudio(voice: string | undefined, lines: VideoNarration['lines'] | undefined): (LineAudio | undefined)[] {
  const decoded = useRef(new Map<string, Promise<AudioBuffer>>())
  const [audio, setAudio] = useState<{ key: string; lines: (LineAudio | undefined)[] }>()
  const key = voice && lines ? JSON.stringify([voice, lines]) : ''

  useEffect(() => {
    if (!voice || !lines?.length) return
    let live = true
    const found: (LineAudio | undefined)[] = lines.map(() => undefined)
    lines.forEach((line, i) => {
      const id = `${voice}\0${line.text}`
      let buffer = decoded.current.get(id)
      if (!buffer) {
        buffer = host
          .call('video.speakLine', voice, line.text)
          .then(({ wav }) => audioContext().decodeAudioData(wav.slice().buffer as ArrayBuffer))
        // A line that couldn't be spoken is tried again next time.
        buffer.catch(() => decoded.current.delete(id))
        decoded.current.set(id, buffer)
      }
      buffer.then(
        (spoken) => {
          if (!live) return
          found[i] = { start: line.start, duration: spoken.duration, buffer: spoken }
          setAudio({ key, lines: [...found] })
        },
        () => {},
      )
    })
    return () => {
      live = false
    }
  }, [voice, lines, key])

  return useMemo(() => (audio?.key === key ? audio.lines : []), [audio, key])
}

/** Plays `lines` in step with the clock the page reports: every frame while it plays, and on pause. */
function usePlayback(bridge: DocumentBridge | null, video: boolean, lines: (LineAudio | undefined)[]) {
  useEffect(() => {
    if (!bridge || !video || !lines.some(Boolean)) return
    const output = audioContext()
    /** The lines playing, and the AudioContext time the clock's 0 is at. */
    let playing: { zero: number; sources: AudioBufferSourceNode[] } | null = null

    const stop = () => {
      for (const source of playing?.sources ?? []) source.stop()
      playing = null
    }
    const start = (time: number) => {
      stop()
      void output.resume()
      const now = output.currentTime
      const sources = narrationSchedule(lines, time).map(({ index, delay, offset }) => {
        const source = output.createBufferSource()
        source.buffer = lines[index]?.buffer ?? null
        source.connect(output.destination)
        source.start(now + delay, offset)
        return source
      })
      playing = { zero: now - time, sources }
    }

    const off = bridge.on((message) => {
      if (message.type !== 'clock') return
      const { time, playing: on } = message.clock
      if (!on) stop()
      else if (!playing || Math.abs(output.currentTime - playing.zero - time) > DRIFT) start(time)
    })
    return () => {
      off()
      stop()
    }
  }, [bridge, video, lines])
}

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`

/** The top bar's Voice select: no Voice or one from Settings → Voices, and the download of one not on this Mac. */
export function VoiceSelect({ narration: { narration, packs, pack } }: { narration: Narration }) {
  const { open, setOpen, ref } = useDropdown()
  const [failed, setFailed] = useState<string>()
  const voice = narration?.voice
  const chosen = pack?.voices.find((v) => v.id === voice)
  const state = pack?.state

  useEffect(() => {
    if (!failed) return
    const timer = setTimeout(() => setFailed(undefined), 4000)
    return () => clearTimeout(timer)
  }, [failed])

  const choose = (next: string | null) => {
    setOpen(false)
    if (next !== (voice ?? null)) host.call('video.setVoice', next).catch((error: unknown) => setFailed(errorMessage(error)))
  }
  const download = () => {
    if (pack) host.call('voices.download', pack.id).catch((error: unknown) => setFailed(errorMessage(error)))
  }

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button
        className="inline-flex h-[30px] max-w-[180px] items-center gap-[7px] rounded-full border border-line bg-white px-2.5 text-[13px] hover:bg-muted disabled:text-tx3"
        title={narration?.problem ?? 'Voice'}
        aria-label="Voice"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!narration}
        onClick={() => setOpen(!open)}
      >
        <VoiceIcon className={`size-4 ${narration?.problem ? 'text-[#e5484d]' : ''}`} />
        <span className="truncate">{chosen?.name ?? voice ?? 'No voice'}</span>
        <ChevronDownIcon />
      </button>
      {chosen && pack && state?.state === 'downloading' && (
        <div
          role="progressbar"
          aria-label={`${chosen.name} download`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor((state.received / pack.size) * 100)}
          className="h-1 w-14 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-tx transition-[width]" style={{ width: `${Math.floor((state.received / pack.size) * 100)}%` }} />
        </div>
      )}
      {chosen && pack && (state?.state === 'available' || state?.state === 'failed') && (
        <button
          className="inline-flex h-7 items-center gap-1.5 rounded-[7px] px-[9px] text-[13px] text-tx2 hover:bg-black/4 hover:text-tx"
          title={`Download ${chosen.name} (${megabytes(pack.size)}) to narrate the video`}
          aria-label={`Download ${chosen.name}`}
          onClick={download}
        >
          <DownloadIcon className="size-[15px]" />
          {state.state === 'failed' ? 'Try again' : megabytes(pack.size)}
        </button>
      )}
      {open && (
        <Menu className="top-9 right-0 max-h-[60vh] min-w-[240px] overflow-y-auto">
          <MenuHeading>Voice</MenuHeading>
          <MenuItem current={!voice} onClick={() => choose(null)}>
            No voice
            <small className="ml-auto text-[11.5px] font-normal text-tx3">silent</small>
          </MenuItem>
          {packs?.flatMap((p) =>
            p.voices.map((v) => (
              <MenuItem key={v.id} current={v.id === voice} onClick={() => choose(v.id)}>
                <span className="truncate">{v.name}</span>
                <small className="ml-auto flex-none text-[11.5px] font-normal text-tx3">
                  {v.language}
                  {p.state.state !== 'installed' && ` · ${megabytes(p.size)}`}
                </small>
              </MenuItem>
            )),
          )}
          {narration?.problem && <p className="m-0 max-w-[280px] px-2.5 pt-1.5 pb-1 text-[11.5px] leading-[1.4] text-[#b3261e]">{narration.problem}</p>}
        </Menu>
      )}
      {failed && (
        <div
          role="alert"
          className="notice-in pointer-events-none absolute top-[calc(100%+14px)] right-0 z-21 flex w-max max-w-[320px] items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] text-tx2 shadow-[0_4px_16px_-4px_rgba(0,0,0,.15)]"
        >
          <span className="size-1.5 flex-none rounded-full bg-[#e5484d]" />
          <span className="truncate">{failed}</span>
        </div>
      )}
    </div>
  )
}
