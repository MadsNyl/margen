import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { once } from 'node:events'
import { rename, rm } from 'node:fs/promises'
import type { Readable, Writable } from 'node:stream'

// Exporting an Animation video to MP4 (templates ticket 03): step the video's
// clock one frame at a time, capture each frame and pipe it to ffmpeg as raw
// BGRA, which encodes H.264 with VideoToolbox and muxes an MP4. The frames come
// from a `VideoFrames` (an offscreen window in the app, a pretend one in tests).

export const EXPORT_FPS = 30

/** One captured frame: BGRA, rows top to bottom, no padding. */
export interface Frame {
  width: number
  height: number
  data: Uint8Array
}

/** Where an export gets its frames: the Document, laid out at its frame size, its clock in Margen's hands. */
export interface VideoFrames {
  /** Seconds: when the last animation ends. Asked for a later frame, it gives the last one. */
  length: number
  /** The video's frame in CSS px; the MP4 is this size. */
  size: { width: number; height: number }
  /** The frame at `time` seconds, once it has been drawn. Every frame of one export has the same size. */
  frame(time: number): Promise<Frame>
  close(): void
}

export interface ExportOptions {
  /** The ffmpeg binary (`build/ffmpeg.mjs` builds it). */
  ffmpeg: string
  frames: VideoFrames
  /** Where the MP4 goes. It's written beside it first and moved there once done. */
  output: string
  /**
   * A WAV played from the start of the video, mixed into the MP4 as AAC: the
   * narration (ticket 05). Cut, or padded with silence, to the video's length.
   */
  audio?: string
  /** The video's length in seconds, when it's longer than the frames' (narration that runs past the last animation). */
  length?: number
  /** After each frame is handed to ffmpeg. */
  onProgress?: (frame: number, frames: number) => void
  /** Stops the export; it then rejects with the signal's reason and leaves no file behind. */
  signal?: AbortSignal
}

/** Frames in a video `length` seconds long: enough to show its last moment, at least one. */
export function frameCount(length: number, fps = EXPORT_FPS): number {
  // Rounded first, so 2 s isn't 60.000000001 frames.
  return Math.max(1, Math.ceil(Math.round(length * fps * 1000) / 1000))
}

/** H.264 needs even sizes. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

function ffmpegArgs(first: Frame, frames: number, { size, audio, output }: { size: VideoFrames['size']; audio?: string; output: string }) {
  const width = even(size.width)
  const height = even(size.height)
  const duration = (frames / EXPORT_FPS).toFixed(6)
  // About 0.15 bits a pixel: ~9 Mbit/s at 1080p, plenty for flat motion graphics.
  const bitrate = Math.round(width * height * EXPORT_FPS * 0.15)
  return [
    ...['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'],
    ...['-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${first.width}x${first.height}`, '-framerate', String(EXPORT_FPS), '-i', 'pipe:0'],
    ...(audio ? ['-i', audio] : []),
    ...['-map', '0:v'],
    ...['-vf', `scale=${width}:${height}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p`],
    // allow_sw: Apple's software encoder where there's no hardware one (a VM).
    ...['-c:v', 'h264_videotoolbox', '-allow_sw', '1', '-profile:v', 'high', '-b:v', String(bitrate)],
    ...['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'],
    ...(audio ? ['-map', '1:a', '-af', 'apad', '-c:a', 'aac', '-b:a', '192k'] : []),
    ...['-t', duration, '-movflags', '+faststart', '-f', 'mp4', output],
  ]
}

/** Exports the video to `output`. Rejects when ffmpeg or a frame fails, and on cancel; no file is left behind then. */
export async function exportVideo({ ffmpeg, frames, output, audio, length, onProgress, signal }: ExportOptions): Promise<void> {
  const total = frameCount(Math.max(frames.length, length ?? 0))
  const partial = `${output}.partial`
  let child: ChildProcessByStdio<Writable, null, Readable> | undefined
  let stderr = ''
  const stop = () => child?.kill('SIGKILL')
  signal?.addEventListener('abort', stop)
  try {
    signal?.throwIfAborted()
    const first = await frames.frame(0)
    signal?.throwIfAborted()
    const ffmpegProcess = spawn(ffmpeg, ffmpegArgs(first, total, { size: frames.size, audio, output: partial }), {
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    child = ffmpegProcess
    const { stdin } = ffmpegProcess
    ffmpegProcess.stderr.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-4000)))
    const exited = new Promise<number | null>((resolve, reject) => {
      ffmpegProcess.once('error', reject)
      ffmpegProcess.once('close', resolve)
    })
    // A write to an ffmpeg that has stopped shows up as its exit, below.
    stdin.on('error', () => {})
    // ffmpeg stopping before it has every frame; raced against each step.
    const failed = exited.then((code): never => {
      throw signal?.aborted ? signal.reason : new Error(`ffmpeg stopped (${code}): ${stderr.trim() || 'no output'}`)
    })
    failed.catch(() => {})

    const write = async (frame: Frame) => {
      if (frame.width !== first.width || frame.height !== first.height || frame.data.length !== frame.width * frame.height * 4) {
        throw new Error('The frame size changed during the export')
      }
      if (!stdin.write(frame.data)) await Promise.race([once(stdin, 'drain'), failed])
    }
    await write(first)
    onProgress?.(1, total)
    for (let n = 1; n < total; n++) {
      const frame = await Promise.race([frames.frame(n / EXPORT_FPS), failed])
      signal?.throwIfAborted()
      await write(frame)
      onProgress?.(n + 1, total)
    }
    stdin.end()
    const code = await exited
    signal?.throwIfAborted()
    if (code !== 0) throw new Error(`ffmpeg stopped (${code}): ${stderr.trim() || 'no output'}`)
    await rename(partial, output)
  } catch (error) {
    stop()
    if (child && child.exitCode === null && child.signalCode === null) await once(child, 'close').catch(() => {})
    await rm(partial, { force: true })
    throw error
  } finally {
    signal?.removeEventListener('abort', stop)
    frames.close()
  }
}
