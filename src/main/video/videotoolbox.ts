// The Mac's H.264 encoder for an export (`export.ts`): Apple's VideoToolbox, as
// ffmpeg's encoder options. The Electron-aware main picks it on the Mac and
// passes it in, so the export itself stays the same on every platform.

/** allow_sw: Apple's software encoder where there's no hardware one (a VM). */
export const VIDEOTOOLBOX_H264: readonly string[] = ['-c:v', 'h264_videotoolbox', '-allow_sw', '1', '-profile:v', 'high']
