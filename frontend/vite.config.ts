import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '')
  if (mode !== 'e2e' && env.VITE_TEST_AUTH === 'true') {
    throw new Error('Test authentication cannot be enabled in a production build.')
  }

  return {
    plugins: [react()],
    envDir: '..',
    server: {
      host: true,
      port: 5173,
    },
    preview: {
      host: true,
      port: 4173,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      restoreMocks: true,
      exclude: [
        'tests/e2e/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/test-results/**',
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/main.tsx',
          'src/features/notes/generated.ts',
          'src/features/notes/types.ts',
          'src/test/**',
        ],
        thresholds: {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 70,
        },
      },
    },
  }
})
