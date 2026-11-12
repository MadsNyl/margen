// electron-builder beforePack: fetches what's native per arch before that arch is packed.
import gitForArch from './dugite-git.mjs'
import { ffmpegForArch } from './ffmpeg.mjs'

export default async function beforePack(context) {
  await gitForArch(context)
  await ffmpegForArch(context)
}
