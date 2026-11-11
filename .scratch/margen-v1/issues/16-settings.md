# 16: Settings

**What to build:** A Settings dialog (from the Start and Project screens) shows the Claude Code path, version and signed-in state, Codex as "Coming in 1.1", the permission preset switch (Editor / Allow everything), and About with the version and Check for updates (user stories 92–94).

**Blocked by:** 02, 09

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] Agent details come from AgentProvider.detect through the host API
- [x] Changing the preset persists and takes effect on the next request (Seam 1 test)
- [x] Layout matches the prototype's Settings dialog

- From ticket 17: show the update status from `update.status`/`update.changed` in About, with "Check for updates" (`update.check`) and "Restart to update" (`update.install`) when one is downloaded.

## Notes from ticket 16 (for later tickets)

- **Dialog:** `src/renderer/src/components/Settings.tsx`. `SettingsProvider` wraps the app in `App.tsx`; `useOpenSettings()` opens it. It opens from the gear on the Start screen and the Project page, and from the Composer's preset badge, which is now a button (`aria-label="Permission preset"`, text "Editor" / "Allow all"). Escape (preventDefault, so it doesn't stop a Turn), ✕ or a click on the scrim closes it.
- **Agent:** `agent.detect` on open; the row reads `path · vVERSION · signed in (plan)`, with a Ready / Signed out / Not found pill. Codex is a static "Coming in 1.1".
- **Permissions:** radios call `permissions.setPreset` and follow `permissions.changed`. The preset stays in `permissions.json` (ticket 09's store); there is no separate settings file and no `src/main/settings/` module, since nothing else needed storing.
- **About:** new host call `app.version` (`createHost({ version })`; the app passes `app.getVersion()` when packaged, else `package.json`'s version, since unpackaged Electron reports its own). Update status from `update.status`/`update.changed`: "Check for updates" is disabled while `unavailable` (dev, tests), checking or downloading; it becomes "Restart to update" (`update.install`) when `ready`. A line under the licence says checking / up to date / downloading / ready / failed.
- **Not done:** remembering model and effort across Documents (ticket 10's optional note). It stays Composer state that resets per Document.
- **Tests:** `e2e/settings.spec.ts` (dialog from Start, Project page and the badge; preset written to `permissions.json`); `test/seam1/settings.test.ts` (`app.version`, Agent details through `agent.detect`). `e2e/permissions.spec.ts` now finds the badge as a button.
