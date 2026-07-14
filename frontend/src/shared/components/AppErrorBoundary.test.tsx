import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import AppErrorBoundary from './AppErrorBoundary'

function BrokenView(): never {
  throw new Error('private render detail')
}

describe('AppErrorBoundary', () => {
  it('shows a safe fallback without exposing the render error and can reload', () => {
    const onReload = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const preventExpectedWindowError = (event: ErrorEvent) => event.preventDefault()
    window.addEventListener('error', preventExpectedWindowError)

    render(
      <AppErrorBoundary onReload={onReload}>
        <BrokenView />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: 'NoteVault could not display this page' })).toBeInTheDocument()
    expect(screen.queryByText('private render detail')).not.toBeInTheDocument()
    screen.getByRole('button', { name: 'Reload NoteVault' }).click()
    expect(onReload).toHaveBeenCalledOnce()
    window.removeEventListener('error', preventExpectedWindowError)
    consoleError.mockRestore()
  })
})
