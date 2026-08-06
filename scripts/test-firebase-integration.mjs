import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const firebaseCli = resolve(repositoryRoot, 'node_modules/firebase-tools/lib/bin/firebase.js')
const successMarker = '__NOTEVAULT_FIRESTORE_TESTS_PASSED__'
const testCommand = process.platform === 'win32'
  ? `python -m pytest -m integration backend/tests/integration && echo ${successMarker}`
  : `python -m pytest -m integration backend/tests/integration && printf '%s\\n' ${successMarker}`

function runFirebase() {
  return new Promise((resolveRun, reject) => {
    const child = spawn(
      process.execPath,
      [firebaseCli, 'emulators:exec', '--only', 'firestore', '--project', 'notevault-test', testCommand],
      {
        cwd: repositoryRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => process.stderr.write(chunk))
    child.once('error', reject)
    child.once('close', (code, signal) => resolveRun({ code: code ?? 1, output, signal }))
  })
}

function cleanupWindowsEmulator() {
  if (process.platform !== 'win32') return Promise.resolve()

  const rulesPath = resolve(repositoryRoot, 'firestore.rules').replaceAll("'", "''")
  const command = [
    `$rules = '${rulesPath}'`,
    `$targets = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'java.exe' -and $_.CommandLine -and $_.CommandLine.Contains($rules) }`,
    '$targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }',
  ].join('; ')

  return new Promise((resolveCleanup) => {
    const cleanup = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      stdio: 'ignore',
      windowsHide: true,
    })
    cleanup.once('close', () => resolveCleanup())
    cleanup.once('error', () => resolveCleanup())
  })
}

try {
  const result = await runFirebase()
  await cleanupWindowsEmulator()

  if (result.output.includes(successMarker)) {
    process.exit(0)
  }

  process.stderr.write(`Firestore integration command did not emit ${successMarker}.\n`)
  process.exit(result.code)
} catch (error) {
  await cleanupWindowsEmulator()
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
