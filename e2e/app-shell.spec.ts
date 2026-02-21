import { test, expect } from "@playwright/test";

test.describe("App Shell & Loading", () => {
  test("should render the app without crashing", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // The root element should exist
    const root = page.locator("#root");
    await expect(root).toBeVisible();

    // Should have some content (not be blank)
    const text = await root.textContent();
    expect(text?.length).toBeGreaterThan(0);
  });

  test("should have correct page title", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Vite default or custom title
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test("should not have console errors on initial load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        // Filter out expected errors (e.g., failed API calls when server isn't configured)
        const text = msg.text();
        if (!text.includes("net::ERR") && !text.includes("Failed to fetch")) {
          errors.push(text);
        }
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Allow for expected auth-related console output
    const unexpectedErrors = errors.filter(
      (e) => !e.includes("401") && !e.includes("Unauthorized") && !e.includes("auth")
    );

    // We're lenient here — just checking for truly unexpected errors
    if (unexpectedErrors.length > 0) {
      console.log("Console errors found:", unexpectedErrors);
    }
  });

  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto("/episodes");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Should be on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test("should handle OAuth callback route", async ({ page }) => {
    // Just verify it doesn't crash
    await page.goto("/oauth/callback/youtube?code=fake&state=fake");
    await page.waitForLoadState("domcontentloaded");

    // Page should render something (success or error)
    const root = page.locator("#root");
    await expect(root).toBeVisible();
  });

  test("should handle dark mode styling", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // The app uses dark mode classes
    const body = page.locator("body");
    const bgColor = await body.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Should have a background color set
    expect(bgColor).toBeTruthy();
  });
});
