import { test, expect } from '@playwright/test'

test.describe('App Loading', () => {
  test('should load without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // App should render something (not a blank page)
    const body = page.locator('body')
    await expect(body).not.toBeEmpty()

    // No critical JS errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('401') && !e.includes('fetch') && !e.includes('network')
    )
    expect(criticalErrors).toHaveLength(0)
  })

  test('should have correct page title or meta', async ({ page }) => {
    await page.goto('/')
    // Just verify the page loads with some title
    const title = await page.title()
    expect(title).toBeTruthy()
  })

  test('should load CSS and not show unstyled content', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    // Check that stylesheets are loaded
    const styleSheets = await page.evaluate(() => document.styleSheets.length)
    expect(styleSheets).toBeGreaterThan(0)
  })
})
