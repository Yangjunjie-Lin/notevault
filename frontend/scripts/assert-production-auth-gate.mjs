import { spawnSync } from 'node:child_process'

const windows = process.platform === 'win32'
const command = windows ? (process.env.ComSpec || 'cmd.exe') : 'npm'
const args = windows ? ['/d', '/s', '/c', 'npm.cmd run build'] : ['run', 'build']
const result = spawnSync(command, args, {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    VITE_TEST_AUTH: 'true',
  },
  encoding: 'utf8',
})
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

if (result.error) throw result.error

if (result.status === 0) {
  throw new Error('Production build unexpectedly accepted VITE_TEST_AUTH=true.')
}
if (!output.includes('Test authentication cannot be enabled in a production build.')) {
  throw new Error(`Production auth gate failed for an unexpected reason.\n${output}`)
}

console.log('Production build correctly rejected VITE_TEST_AUTH=true.')
