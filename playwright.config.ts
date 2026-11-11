import { defineConfig } from '@playwright/test'

// Seam 2: drives the built Electron app (run `pnpm e2e`, which builds first).
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 30_000,
  reporter: process.env.CI ? 'github' : 'list',
})
