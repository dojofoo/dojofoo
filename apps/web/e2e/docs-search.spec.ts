import { expect, test } from 'playwright/test'

test('docs hydrate and search opens', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/docs', { waitUntil: 'networkidle' })
  await page.locator('[data-search-full]').click()

  await expect(page.getByRole('dialog')).toBeVisible()
  const searchInput = page.getByPlaceholder('Search')
  await expect(searchInput).toBeVisible()
  await searchInput.fill('setup')
  await expect(page.getByRole('button', { name: /dojo setup/i }).first()).toBeVisible()
  expect(pageErrors).toEqual([])
})
