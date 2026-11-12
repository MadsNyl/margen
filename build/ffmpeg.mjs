// The ffmpeg Margen exports videos with (templates ticket 03). There's no
// first-party LGPL ffmpeg for macOS to download (ffmpeg.org's links point to
// GPL builds with x264), so this builds one from FFmpeg's own release tarball,
// pinned by sha256: LGPL-2.1-or-later only (no --enable-gpl, --enable-version3
// or --enable-nonfree), H.264 through Apple's VideoToolbox, and nothing but
// what an export needs. Builds are cached in the temp folder, keyed by version,
// configuration and arch, and copied to vendor/ffmpeg/<arch>/, where dev runs,
// tests and electron-builder's extraResources find them.
//
// `node build/ffmpeg.mjs [arm64|x64 ...]` (the machine's own arch by default);
// postinstall runs it, and beforePack runs it for the arch being packed.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism, arch as ownArch, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FFMPEG_VERSION = '9.0.2'
const TARBALL = `ffmpeg-${FFMPEG_VERSION}.tar.xz`
const URL = `https://ffmpeg.org/releases/${TARBALL}`
// Checked against the release's signature (FFmpeg release signing key FCF986EA15E6E293A5644F10B4322F04D67658D8).
const SHA256 = '8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e'
// Electron 45's own minimum.
const MACOS_MIN = '12.0'

/** Raw BGRA frames on stdin and a WAV narration track in; H.264 + AAC in an MP4 out. */
const COMPONENTS = [
  '--enable-encoder=h264_videotoolbox,aac',
  '--enable-decoder=rawvideo,pcm_s16le,pcm_s24le,pcm_f32le',
  '--enable-demuxer=rawvideo,wav',
  '--enable-muxer=mp4',
  '--enable-protocol=file,pipe',
  '--enable-filter=scale,format,null,anull,aformat,aresample,apad,atrim,trim',
]

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(tmpdir(), 'margen-ffmpeg')

/** Where the binary for `arch` ends up, for dev, tests and packing. */
export const vendorFfmpeg = (arch) => join(ROOT, 'vendor', 'ffmpeg', arch, 'ffmpeg')

function configureArgs(arch) {
  const target = arch === 'x64' ? 'x86_64' : 'arm64'
  const flags = `-arch ${target} -mmacosx-version-min=${MACOS_MIN}`
  return [
    '--disable-everything',
    '--disable-autodetect',
    '--disable-doc',
    '--disable-debug',
    '--disable-network',
    '--disable-ffplay',
    '--disable-ffprobe',
    '--disable-avdevice',
    '--enable-pthreads',
    '--enable-videotoolbox',
    '--enable-avfilter',
    '--enable-swscale',
    '--enable-swresample',
    ...COMPONENTS,
    '--enable-cross-compile',
    '--target-os=darwin',
    `--arch=${arch === 'x64' ? 'x86_64' : 'aarch64'}`,
    '--cc=clang',
    `--extra-cflags=${flags}`,
    `--extra-ldflags=${flags}`,
    // nasm isn't on a stock Mac; VideoToolbox does the heavy lifting anyway.
    ...(arch === 'x64' ? ['--disable-x86asm'] : []),
  ]
}

/** Runs a build step quietly (FFmpeg's compile warnings are many), showing its output only when it fails. */
function run(command, args, cwd) {
  try {
    execFileSync(command, args, { cwd, stdio: 'pipe', maxBuffer: 256 * 1024 * 1024 })
  } catch (error) {
    process.stderr.write(String(error.stdout ?? '').slice(-20_000) + String(error.stderr ?? '').slice(-20_000))
    throw error
  }
}

async function sha256(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function source() {
  mkdirSync(CACHE, { recursive: true })
  const tarball = join(CACHE, TARBALL)
  if (!existsSync(tarball) || (await sha256(tarball)) !== SHA256) {
    console.log(`ffmpeg: downloading ${URL}`)
    execFileSync('curl', ['-fsSL', '-o', `${tarball}.partial`, URL], { stdio: 'inherit' })
    if ((await sha256(`${tarball}.partial`)) !== SHA256) throw new Error(`${TARBALL} doesn't match its sha256`)
    renameSync(`${tarball}.partial`, tarball)
  }
  return tarball
}

/** Builds (or takes from the cache) the ffmpeg for `arch` and puts it in vendor/ffmpeg/<arch>/. */
export async function ensureFfmpeg(arch) {
  if (arch !== 'arm64' && arch !== 'x64') throw new Error(`No ffmpeg for arch ${arch}`)
  const args = configureArgs(arch)
  const key = createHash('sha256').update(JSON.stringify([FFMPEG_VERSION, args])).digest('hex').slice(0, 12)
  const built = join(CACHE, `${FFMPEG_VERSION}-${arch}-${key}`)
  const vendor = dirname(vendorFfmpeg(arch))
  const stamp = join(vendor, 'build.txt')
  if (existsSync(vendorFfmpeg(arch)) && existsSync(stamp) && readFileSync(stamp, 'utf8').startsWith(key)) return vendorFfmpeg(arch)

  if (!existsSync(join(built, 'ffmpeg'))) {
    const tarball = await source()
    const work = join(CACHE, `work-${arch}-${key}`)
    rmSync(work, { recursive: true, force: true })
    mkdirSync(work, { recursive: true })
    execFileSync('tar', ['-xJf', tarball, '-C', work, '--strip-components=1'])
    console.log(`ffmpeg: building ${FFMPEG_VERSION} for ${arch} (a minute or two, once per machine)`)
    run('./configure', args, work)
    const config = readFileSync(join(work, 'ffbuild', 'config.mak'), 'utf8')
    // The build must stay LGPL: GPL, version 3 and nonfree parts can't ship inside an MIT app.
    if (/^CONFIG_(GPL|VERSION3|NONFREE)=yes/m.test(config)) throw new Error('ffmpeg would be built with GPL, v3 or nonfree parts')
    run('make', [`-j${availableParallelism()}`, 'ffmpeg'], work)
    mkdirSync(built, { recursive: true })
    execFileSync('strip', ['-o', join(built, 'ffmpeg'), join(work, 'ffmpeg')])
    copyFileSync(join(work, 'COPYING.LGPLv2.1'), join(built, 'COPYING.LGPLv2.1'))
    rmSync(work, { recursive: true, force: true })
  }

  mkdirSync(vendor, { recursive: true })
  copyFileSync(join(built, 'ffmpeg'), vendorFfmpeg(arch))
  copyFileSync(join(built, 'COPYING.LGPLv2.1'), join(vendor, 'COPYING.LGPLv2.1'))
  writeFileSync(
    join(vendor, 'README.txt'),
    `FFmpeg ${FFMPEG_VERSION} (https://ffmpeg.org), licensed under the LGPL 2.1 or later (COPYING.LGPLv2.1).\n` +
      `Built unmodified from ${URL} (sha256 ${SHA256}) with:\n./configure ${args.join(' ')}\n`,
  )
  writeFileSync(stamp, `${key}\n`)
  return vendorFfmpeg(arch)
}

// electron-builder's Arch enum.
const ARCHS = { 1: 'x64', 3: 'arm64' }

/** beforePack */
export async function ffmpegForArch({ arch, electronPlatformName }) {
  if (electronPlatformName !== 'darwin') throw new Error('Margen only builds ffmpeg for macOS so far')
  if (!ARCHS[arch]) throw new Error(`No ffmpeg for arch ${arch}`)
  await ensureFfmpeg(ARCHS[arch])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') {
    console.log('ffmpeg: skipped (macOS only so far)')
  } else {
    const archs = process.argv.slice(2)
    for (const arch of archs.length ? archs : [ownArch()]) console.log(`ffmpeg: ${await ensureFfmpeg(arch)}`)
  }
}
