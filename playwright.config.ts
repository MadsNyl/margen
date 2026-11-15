import { defineConfig } from '@playwright/test'

// Seam 2: drives the built Electron app (run `pnpm e2e`, which builds first).
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 30_000,
  // GitHub's Mac runners are slower than a dev machine; a flow that passes on a retry isn't a failure.
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
})
