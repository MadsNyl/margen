// Reads what the export tests check straight from an MP4's boxes (ISO/IEC 14496-12),
// so they don't trust ffmpeg to report on its own output.

export interface Mp4Track {
  /** `vide` or `soun`. */
  handler: string
  /** Seconds, from the track's own timescale. */
  duration: number
  samples: number
  /** From the track header, in pixels; 0 for audio. */
  width: number
  height: number
  /** The sample entry's format: `avc1`, `mp4a`. */
  codec: string
}

function* boxes(data: Buffer, start = 0, end = data.length): Generator<{ type: string; body: Buffer }> {
  let at = start
  while (at + 8 <= end) {
    let size = data.readUInt32BE(at)
    const type = data.toString('latin1', at + 4, at + 8)
    let header = 8
    if (size === 1) {
      size = Number(data.readBigUInt64BE(at + 8))
      header = 16
    } else if (size === 0) size = end - at
    yield { type, body: data.subarray(at + header, at + size) }
    at += size
  }
}

function child(box: Buffer, type: string): Buffer {
  const found = [...boxes(box)].find((b) => b.type === type)
  if (!found) throw new Error(`No ${type} box`)
  return found.body
}

export function mp4Tracks(data: Buffer): Mp4Track[] {
  const moov = child(data, 'moov')
  return [...boxes(moov)]
    .filter((b) => b.type === 'trak')
    .map(({ body: trak }) => {
      const tkhd = child(trak, 'tkhd')
      const mdia = child(trak, 'mdia')
      const mdhd = child(mdia, 'mdhd')
      const v1 = mdhd[0] === 1
      const timescale = mdhd.readUInt32BE(v1 ? 20 : 12)
      const units = v1 ? Number(mdhd.readBigUInt64BE(24)) : mdhd.readUInt32BE(16)
      const handler = child(mdia, 'hdlr').toString('latin1', 8, 12)
      const stbl = child(child(mdia, 'minf'), 'stbl')
      const stsd = child(stbl, 'stsd')
      const stsz = child(stbl, 'stsz')
      return {
        handler,
        duration: units / timescale,
        samples: stsz.readUInt32BE(8),
        width: tkhd.readUInt32BE(tkhd.length - 8) / 65536,
        height: tkhd.readUInt32BE(tkhd.length - 4) / 65536,
        codec: stsd.toString('latin1', 12, 16),
      }
    })
}
