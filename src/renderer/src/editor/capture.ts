import { host } from '../host'

// Screenshots of the Document view, for Annotations: a drawing's Viewport and
// a Pick's element. Taking one can fail (a hidden window); callers go without.

/** A screenshot of the Document view as shown, in device pixels (2× on Retina), or `null`. */
export async function captureDocument(): Promise<HTMLImageElement | null> {
  const captured = await host.call('document.capture').catch(() => null)
  if (!captured) return null
  const image = new Image()
  image.src = captured
  return image.decode().then(
    () => image,
    () => null,
  )
}
