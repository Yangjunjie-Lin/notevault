import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { backendOrigin as backendUrl } from './ports'

async function resetDatabase(request: APIRequestContext) {
  const response = await request.post(`${backendUrl}/__test__/reset`)
  expect(response.ok()).toBe(true)
}

async function seedNotes(request: APIRequestContext, count: number) {
  const response = await request.post(`${backendUrl}/__test__/seed`, {
    data: { count, prefix: 'seed', tag: 'pages' },
  })
  expect(response.ok()).toBe(true)
}

async function signIn(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /sign in with google/i }).click()
  await expect(page.getByRole('main', { name: 'Notes workspace' })).toBeVisible()
}

async function mockAi(page: Page) {
  await page.route('**/ai/format-markdown', async (route) => {
    const payload = route.request().postDataJSON() as { text: string }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: payload.text,
        changed: false,
        model: 'deepseek-ai/DeepSeek-V4-Flash',
        traceId: 'e2e-format',
      }),
    })
  })
  await page.route('**/ai/revise-note', async (route) => {
    const payload = route.request().postDataJSON() as { text: string; instruction: string }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: `${payload.text}\n\n> Revised for: ${payload.instruction}`,
        model: 'deepseek-ai/DeepSeek-V4-Flash',
        traceId: 'e2e-revise',
      }),
    })
  })
}

async function expectNoAxeViolations(page: Page, state: string) {
  // Analyze the settled UI, after the longest 250ms dialog transition completes.
  await page.waitForTimeout(300)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, `${state}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([])
}

test.beforeEach(async ({ request, page }) => {
  await resetDatabase(request)
  await mockAi(page)
})

test('core create, edit, delete, pagination, dialog, and sign-out flow @smoke', async ({ page, request }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await seedNotes(request, 25)
  await signIn(page)
  await expect(page.getByText('20 loaded notes')).toBeVisible()

  const body = page.getByLabel('Note body (Markdown)')
  await body.fill('# Cross-browser Markdown\n\n- smoke item')
  await page.getByPlaceholder(/comma-separated/i).fill('Smoke, Work')
  await page.getByRole('tab', { name: 'Preview' }).click()
  await expect(page.getByRole('heading', { name: 'Cross-browser Markdown' })).toBeVisible()
  await page.getByRole('tab', { name: 'Write' }).click()
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.locator('.nv-status')).toContainText('Note created.')

  let createdCard = page.locator('.nv-card').filter({ hasText: 'Cross-browser Markdown' })
  await expect(createdCard).toHaveCount(1)
  await createdCard.getByRole('button', { name: /edit note from/i }).click()
  await body.fill('# Edited cross-browser note')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { name: 'Edited cross-browser note' })).toBeVisible()

  createdCard = page.locator('.nv-card').filter({ hasText: 'Edited cross-browser note' })
  const deleteButton = createdCard.getByRole('button', { name: /delete note from/i })
  await deleteButton.click()
  const cancelButton = page.getByRole('button', { name: 'Cancel', exact: true })
  await expect(cancelButton).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Delete this note?' })).toHaveCount(0)
  await expect(deleteButton).toBeFocused()

  await deleteButton.click()
  await page.getByRole('button', { name: 'Delete note', exact: true }).click()
  await expect(page.locator('.nv-status')).toContainText('Note deleted.')
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByText('25 loaded notes')).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: /beautifully private/i })).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('signed-out landing and authenticated workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /beautifully private/i })).toBeVisible()
  await expect(page.getByText('Private to your Google account', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /sign in with google/i }).click()
  await expect(page.getByText('New note', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your notes' })).toBeVisible()
})

test('full Markdown, tags, filters, unsaved changes, and delete workflow', async ({ page }) => {
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

  await page.getByRole('button', { name: /edit note from/i }).click()
  await body.fill('# Dirty E2E draft')
  await page.getByRole('button', { name: 'Cancel editing' }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(body).toHaveValue('# Dirty E2E draft')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('.nv-status')).toContainText('Changes saved.')

  await page.getByRole('button', { name: /delete note from/i }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dirty E2E draft' })).toBeVisible()
  await page.getByRole('button', { name: /delete note from/i }).click()
  await page.getByRole('button', { name: 'Delete note', exact: true }).click()
  await expect(page.locator('.nv-status')).toContainText('Note deleted.')
})

test('deleting the pagination boundary then Load more appends without duplicates', async ({ page, request }) => {
  await seedNotes(request, 25)
  await signIn(page)
  await expect(page.getByText('20 loaded notes')).toBeVisible()

  const boundaryCard = page.locator('.nv-card').filter({ hasText: 'Pagination seed 05' })
  await expect(boundaryCard).toHaveCount(1)
  await boundaryCard.getByRole('button', { name: /delete note from/i }).click()
  await page.getByRole('button', { name: 'Delete note', exact: true }).click()
  await expect(page.getByText('19 loaded notes')).toBeVisible()

  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByText('24 loaded notes')).toBeVisible()
  await expect(page.getByText('Pagination seed 00', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  const cards = page.locator('.nv-card')
  await expect(cards).toHaveCount(24)
  const cardTexts = await cards.allTextContents()
  expect(new Set(cardTexts).size).toBe(24)
})

test('Load more appends notes and a filter change resets the cursor', async ({ page, request }) => {
  await seedNotes(request, 25)
  await signIn(page)
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByText('25 loaded notes')).toBeVisible()

  const resetRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname === '/notes' && url.searchParams.get('q') === 'Pagination seed 24'
  })
  await page.getByPlaceholder('Search notes').fill('Pagination seed 24')
  await page.getByRole('button', { name: 'Search' }).click()
  const requestAfterFilter = await resetRequest
  expect(new URL(requestAfterFilter.url()).searchParams.has('cursor')).toBe(false)
  await expect(page.getByText('1 loaded note')).toBeVisible()
})

test('pagination errors preserve already loaded notes', async ({ page, request }) => {
  await seedNotes(request, 25)
  await signIn(page)
  await page.route('**/notes?*cursor=*', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Controlled pagination failure' }),
  }))

  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByRole('alert')).toContainText('Controlled pagination failure')
  await expect(page.getByText('20 loaded notes')).toBeVisible()
  await expect(page.locator('.nv-card')).toHaveCount(20)
})

test('renders concrete 500 and Firestore 503 recovery states', async ({ page }) => {
  await page.route('**/notes?*', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Controlled API failure' }),
  }))
  await signIn(page)
  await expect(page.getByRole('alert')).toContainText('Controlled API failure')
  await expect(page.getByRole('main', { name: 'Notes workspace' })).toBeVisible()

  await page.unroute('**/notes?*')
  await page.route('**/notes?*', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Notes are temporarily unavailable. Please try again.' }),
  }))
  await page.reload()
  await page.getByRole('button', { name: /sign in with google/i }).click()
  await expect(page.getByRole('alert')).toContainText('Notes are temporarily unavailable')
})

test('AI formatting review, AI Assist revision, and failure fallback preserve the draft @smoke', async ({ page }) => {
  await signIn(page)
  await page.unroute('**/ai/format-markdown')
  let formattedRequest = 0
  await page.route('**/ai/format-markdown', async (route) => {
    const payload = route.request().postDataJSON() as { text: string }
    formattedRequest += 1
    const formatted = formattedRequest === 1
      ? '# Meeting note\n\n- agenda'
      : '# Revised meeting note\n\n- [ ] agenda'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: formatted,
        changed: formatted !== payload.text,
        model: 'deepseek-ai/DeepSeek-V4-Flash',
        traceId: `format-${formattedRequest}`,
      }),
    })
  })

  const body = page.getByLabel('Note body (Markdown)')
  await body.fill('#Meeting note\n-agenda')
  await page.getByPlaceholder(/comma-separated/i).fill('Meetings')
  const addButton = page.getByRole('button', { name: 'Add note' })
  await addButton.click()
  const review = page.getByRole('dialog', { name: 'Review AI formatting' })
  await expect(review.getByLabel('Original Markdown')).toContainText('#Meeting note')
  await expect(review.getByLabel('Formatted Markdown')).toContainText('# Meeting note')
  await expectNoAxeViolations(page, 'AI formatting review')
  await review.getByRole('button', { name: 'Apply & Save' }).click()
  await expect(page.getByRole('heading', { name: 'Meeting note' })).toBeVisible()

  const card = page.locator('.nv-card').filter({ hasText: 'Meeting note' })
  await card.getByRole('button', { name: /edit note from/i }).click()
  await page.getByRole('button', { name: 'AI Assist' }).click()
  await page.getByLabel('Editing instruction').fill('Convert this to a checklist.')
  await page.getByRole('button', { name: 'Generate revision' }).click()
  await expect(page.getByText(/Revised for: Convert this to a checklist/)).toBeVisible()
  await expectNoAxeViolations(page, 'AI Assist candidate')
  await expect(body).toHaveValue('# Meeting note\n\n- agenda')
  await page.getByRole('button', { name: 'Apply to draft' }).click()
  await expect(body).toHaveValue(/Revised for: Convert this to a checklist\./)
  await body.fill('#Revised meeting note\n- [ ] agenda')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('dialog', { name: 'Review AI formatting' })
    .getByRole('button', { name: 'Apply & Save' }).click()
  await expect(page.getByRole('heading', { name: 'Revised meeting note' })).toBeVisible()

  await page.unroute('**/ai/format-markdown')
  await page.route('**/ai/format-markdown', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'AI service is temporarily unavailable' }),
  }))
  await body.fill('Original failure-safe note')
  await page.getByRole('button', { name: 'Add note' }).click()
  const failure = page.getByRole('dialog', { name: 'AI formatting unavailable' })
  await expect(failure.getByRole('alert')).toContainText('temporarily unavailable')
  await expect(body).toHaveValue('Original failure-safe note')
  await expectNoAxeViolations(page, 'AI formatting failure')
  await failure.getByRole('button', { name: 'Save Original' }).click()
  await expect(page.getByText('Original failure-safe note', { exact: true })).toBeVisible()
})

test('axe: signed-out, empty, list, edit, preview, and dialogs', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /beautifully private/i })).toBeVisible()
  await expectNoAxeViolations(page, 'signed-out landing')

  await page.getByRole('button', { name: /sign in with google/i }).click()
  await expect(page.getByText('No notes yet')).toBeVisible()
  await expectNoAxeViolations(page, 'authenticated empty state')

  await resetDatabase(request)
  await seedNotes(request, 1)
  await page.reload()
  await page.getByRole('button', { name: /sign in with google/i }).click()
  await expect(page.getByText('Pagination seed 00', { exact: true })).toBeVisible()
  await expectNoAxeViolations(page, 'note list')

  await page.getByRole('button', { name: /edit note from/i }).click()
  await expectNoAxeViolations(page, 'edit mode')
  await page.getByLabel('Note body (Markdown)').fill('# Accessible preview')
  await page.getByRole('button', { name: 'AI Assist' }).click()
  await expectNoAxeViolations(page, 'AI Assist panel')
  await page.getByRole('button', { name: 'Close AI Assist' }).click()
  await page.getByRole('tab', { name: 'Preview' }).click()
  await expectNoAxeViolations(page, 'Markdown preview')

  await page.getByRole('button', { name: 'Cancel editing' }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible()
  await expectNoAxeViolations(page, 'unsaved changes dialog')
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await page.getByRole('button', { name: /delete note from/i }).click()
  await expectNoAxeViolations(page, 'delete dialog')
})

test('axe: API error and mobile viewport @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/notes?*', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Notes are temporarily unavailable. Please try again.' }),
  }))
  await signIn(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await expectNoAxeViolations(page, 'mobile API error state')
  const body = page.getByLabel('Note body (Markdown)')
  await body.fill('#Mobile AI draft')
  await page.getByRole('button', { name: 'AI Assist' }).click()
  await page.getByLabel('Editing instruction').fill('Make this clearer.')
  await page.getByRole('button', { name: 'Generate revision' }).click()
  await expect(page.getByRole('button', { name: 'Apply to draft' })).toBeVisible()
  await expectNoAxeViolations(page, 'mobile AI candidate')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Close AI Assist' }).click()

  await page.unroute('**/ai/format-markdown')
  await page.route('**/ai/format-markdown', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      text: '# Mobile AI draft',
      changed: true,
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      traceId: 'mobile-review',
    }),
  }))
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByRole('dialog', { name: 'Review AI formatting' })).toBeVisible()
  await expectNoAxeViolations(page, 'mobile AI formatting review')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
