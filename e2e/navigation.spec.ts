import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  // These tests verify route handling for unauthenticated users
  test("should handle /episodes route", async ({ page }) => {
    await page.goto("/episodes");
    // Should redirect to login since not authenticated
    await expect(page).toHaveURL(/\/login/);
  });

  test("should handle /podcast-info route", async ({ page }) => {
    await page.goto("/podcast-info");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should handle /settings route", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should handle unknown routes by redirecting", async ({ page }) => {
    await page.goto("/nonexistent-page");
    // Should redirect to /episodes then to /login
    await expect(page).toHaveURL(/\/login/);
  });

  test("should handle /create-podcast route", async ({ page }) => {
    await page.goto("/create-podcast");
    await expect(page).toHaveURL(/\/login/);
  });
});
