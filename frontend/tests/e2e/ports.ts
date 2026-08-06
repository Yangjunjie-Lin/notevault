import { fileURLToPath } from 'node:url'

function readPort(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback

  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`)
  }
  return port
}

export const frontendPort = readPort('NOTEVAULT_E2E_FRONTEND_PORT', 4173)
export const backendPort = readPort('NOTEVAULT_E2E_BACKEND_PORT', 18_080)
export const frontendOrigin = `http://127.0.0.1:${frontendPort}`
export const backendOrigin = `http://127.0.0.1:${backendPort}`

const runDirectory = `../../test-results/${frontendPort}-${backendPort}/`
export const buildOutputDirectory = fileURLToPath(new URL(`${runDirectory}dist/`, import.meta.url))
export const artifactOutputDirectory = fileURLToPath(new URL(`${runDirectory}artifacts/`, import.meta.url))
export const reportOutputDirectory = fileURLToPath(new URL(`${runDirectory}report/`, import.meta.url))
