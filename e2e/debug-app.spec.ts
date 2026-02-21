import { test, expect } from '@playwright/test'

test.describe('Debug App Loading', () => {
  test('should render React app in root div', async ({ page }) => {
    // Track all console messages and errors
    const consoleLogs: string[] = []
    const errors: string[] = []
    
    page.on('console', msg => consoleLogs.push(`${msg.type()}: ${msg.text()}`))
    page.on('pageerror', err => errors.push(err.message))
    
    await page.goto('/')
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle')
    
    // Check if root div exists
    const rootDiv = page.locator('#root')
    await expect(rootDiv).toBeAttached()
    
    // Check if anything is rendered in root
    const rootContent = await rootDiv.innerHTML()
    console.log('Root div content:', rootContent)
    
    // Log all console messages
    console.log('Console logs:', consoleLogs)
    
    // Log all errors
    console.log('Page errors:', errors)
    
    // Check document ready state
    const readyState = await page.evaluate(() => document.readyState)
    console.log('Document ready state:', readyState)
    
    // Check if any scripts loaded
    const scripts = await page.evaluate(() => 
      Array.from(document.scripts).map(s => ({ src: s.src, type: s.type }))
    )
    console.log('Scripts:', scripts)
    
    // This will help us understand what's happening
    expect(errors).toHaveLength(0)
  })
})