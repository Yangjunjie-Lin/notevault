import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /sign in with google/i }).click()
  await expect(page.getByRole('main', { name: 'Notes workspace' })).toBeVisible()
}

test('signed-out landing and authenticated workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /beautifully private/i })).toBeVisible()
  await expect(page.getByText('Private to your Google account', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /sign in with google/i }).click()
  await expect(page.getByText('New note', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your notes' })).toBeVisible()
})

test('create, preview, tags, filters, edit, unsaved confirmation, delete, and sign out', async ({ page }) => {
  await signIn(page)
  const body = page.getByLabel('Note body (Markdown)')
  await body.fill('# E2E Markdown\n\n- concrete item')
  await page.getByPlaceholder(/comma-separated/i).fill('E2E, Work')
  await page.getByRole('tab', { name: 'Preview' }).click()
  await expect(page.getByRole('heading', { name: 'E2E Markdown' })).toBeVisible()
  await expect(page.getByText('concrete item')).toBeVisible()
  await page.getByRole('tab', { name: 'Write' }).click()
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.locator('.nv-status')).toContainText('Note created.')
  await expect(page.getByRole('button', { name: 'Filter notes by e2e' })).toBeVisible()

  await page.getByPlaceholder('Search notes').fill('E2E Markdown')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('heading', { name: 'E2E Markdown' })).toBeVisible()
  await page.getByRole('button', { name: 'Filter notes by e2e' }).click()
  await expect(page.getByText('Showing:')).toBeVisible()
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.getByText('Showing:')).toHaveCount(0)

  await page.getByRole('button', { name: /edit note from/i }).first().click()
  await expect(body).toHaveValue('# E2E Markdown\n\n- concrete item')
  await body.fill('# Dirty E2E draft')
  await page.getByRole('button', { name: 'Cancel editing' }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(body).toHaveValue('# Dirty E2E draft')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('.nv-status')).toContainText('Changes saved.')
  await expect(page.getByRole('heading', { name: 'Dirty E2E draft' })).toBeVisible()

  await page.getByRole('button', { name: /delete note from/i }).first().click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dirty E2E draft' })).toBeVisible()
  await page.getByRole('button', { name: /delete note from/i }).first().click()
  await page.getByRole('button', { name: 'Delete note', exact: true }).click()
  await expect(page.locator('.nv-status')).toContainText('Note deleted.')
  await expect(page.getByRole('heading', { name: 'Dirty E2E draft' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: /beautifully private/i })).toBeVisible()
})

test('Load more appends notes and a filter change resets the cursor', async ({ page, request }) => {
  for (let index = 0; index < 25; index += 1) {
    const result = await request.post('http://127.0.0.1:8000/notes', {
      headers: { Authorization: 'Bearer not-a-jwt' },
      data: { text: `Pagination seed ${index.toString().padStart(2, '0')}`, tags: ['pages'] },
    })
    expect(result.status()).toBe(201)
  }

  await signIn(page)
  await expect(page.getByText('20 loaded notes')).toBeVisible()
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByText('25 loaded notes')).toBeVisible()
  await expect(page.getByText('Pagination seed 00')).toBeVisible()

  const resetRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname === '/notes' && url.searchParams.get('q') === 'Pagination seed 24'
  })
  await page.getByPlaceholder('Search notes').fill('Pagination seed 24')
  await page.getByRole('button', { name: 'Search' }).click()
  const requestAfterFilter = await resetRequest
  expect(new URL(requestAfterFilter.url()).searchParams.has('cursor')).toBe(false)
  await expect(page.getByText('1 loaded note')).toBeVisible()
  await expect(page.getByText('Pagination seed 24', { exact: true })).toBeVisible()
})

test('renders a concrete API error banner without losing the workspace', async ({ page }) => {
  await page.route('**/notes?*', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Controlled API failure' }),
  }))
  await signIn(page)
  await expect(page.getByRole('alert')).toContainText('Controlled API failure')
  await expect(page.getByRole('main', { name: 'Notes workspace' })).toBeVisible()
})

test('renders the Firestore unavailable 503 state', async ({ page }) => {
  await page.route('**/notes?*', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Notes are temporarily unavailable. Please try again.' }),
  }))
  await signIn(page)
  await expect(page.getByRole('alert')).toContainText('Notes are temporarily unavailable')
  await expect(page.getByText('No notes yet')).toBeVisible()
})

test('mobile viewport keeps primary touch targets and workspace usable', async ({ page, request }) => {
  await request.post('http://127.0.0.1:8000/notes', {
    headers: { Authorization: 'Bearer not-a-jwt' },
    data: { text: 'Mobile smoke note', tags: ['mobile'] },
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  await expect(page.getByText('Mobile smoke note')).toBeVisible()
  const editBox = await page.getByRole('button', { name: /edit note from/i }).first().boundingBox()
  expect(editBox?.height).toBeGreaterThanOrEqual(40)
  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(noHorizontalOverflow).toBe(true)
})
