import { autoUpdater } from 'electron-updater'
import type { UpdateSource } from './updates'

// The electron-updater adapter for `UpdateSource`. It reads the GitHub
// Releases feed that electron-builder writes into the packaged app
// (app-update.yml), so it only works in a packaged build.

export function createElectronUpdateSource(env: NodeJS.ProcessEnv): UpdateSource {
  autoUpdater.autoDownload = false
  // A downloaded update also installs the next time the user quits.
  autoUpdater.autoInstallOnAppQuit = true
  // Lets a stable build pick up a prerelease, for trying updates against a test release.
  if (env.MARGEN_UPDATE_PRERELEASE === '1') autoUpdater.allowPrerelease = true

  return {
    async check() {
      const result = await autoUpdater.checkForUpdates()
      return result?.isUpdateAvailable ? { version: result.updateInfo.version } : null
    },
    async download() {
      await autoUpdater.downloadUpdate()
    },
    install() {
      autoUpdater.quitAndInstall()
    },
  }
}
