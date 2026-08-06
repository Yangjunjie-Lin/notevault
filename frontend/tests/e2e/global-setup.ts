import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import type { FullConfig } from '@playwright/test'
import { build, preview, type PreviewServer } from 'vite'

import {
  backendOrigin,
  backendPort,
  buildOutputDirectory,
  frontendOrigin,
  frontendPort,
} from './ports'

const frontendRoot = fileURLToPath(new URL('../..', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))

async function waitForUrl(url: string, backend?: ChildProcess) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (backend && backend.exitCode !== null) {
      throw new Error(`E2E backend exited before ${url} became ready.`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${url}.`)
}

async function stopBackend(backend: ChildProcess) {
  if (backend.exitCode !== null) return
  backend.kill('SIGTERM')
  await Promise.race([
    new Promise<void>((resolve) => backend.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (backend.exitCode === null) backend.kill('SIGKILL')
}

export default async function globalSetup(_config: FullConfig) {
  process.env.VITE_TEST_AUTH = 'true'
  process.env.VITE_API_BASE_URL = backendOrigin

  await build({
    root: frontendRoot,
    mode: 'e2e',
    build: { outDir: buildOutputDirectory },
  })

  const python = process.env.PYTHON || 'python'
  const backend = spawn(
    python,
    [
      '-m',
      'uvicorn',
      'tests.e2e_app:app',
      '--app-dir',
      'backend',
      '--host',
      '127.0.0.1',
      '--port',
      String(backendPort),
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        ENVIRONMENT: 'test',
        ALLOWED_ORIGINS: frontendOrigin,
      },
      stdio: 'inherit',
    },
  )

  let previewServer: PreviewServer | undefined
  try {
    await waitForUrl(`${backendOrigin}/health`, backend)
    previewServer = await preview({
      root: frontendRoot,
      mode: 'e2e',
      build: { outDir: buildOutputDirectory },
      preview: { host: '127.0.0.1', port: frontendPort, strictPort: true },
    })
    await waitForUrl(frontendOrigin)
  } catch (error) {
    previewServer?.httpServer.close()
    await stopBackend(backend)
    throw error
  }

  return async () => {
    await new Promise<void>((resolve, reject) => {
      previewServer.httpServer.close((error) => error ? reject(error) : resolve())
    })
    await stopBackend(backend)
  }
}
