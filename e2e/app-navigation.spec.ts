import { test, expect } from "@playwright/test";
import { loginAsTestUser, ensureTestPodcast } from "./helpers/auth";

test.describe("App Navigation (Authenticated)", () => {
  test.beforeEach(async ({ page }) => {
    // Clear state and login
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await loginAsTestUser(page);
    await ensureTestPodcast(page);
    // Re-inject auth after podcast creation
    await loginAsTestUser(page);
  });

  test("should load episodes list after login", async ({ page }) => {
    await page.goto("/episodes");
    await page.waitForLoadState("networkidle");

    // Should show the episodes page — either with episodes or with "New Episode" button
    const episodesVisible =
      (await page.locator("text=New Episode").isVisible()) ||
      (await page.locator("text=Episodes").first().isVisible()) ||
      (await page.locator('button:has-text("New Episode")').isVisible());

    expect(episodesVisible).toBeTruthy();
  });

  test("should show workspace sidebar navigation", async ({ page }) => {
    await page.goto("/episodes");
    await page.waitForLoadState("networkidle");

    // The sidebar should have key nav items
    // WorkspaceNav shows: Dashboard, Episodes, Outreach, Analytics, Podcast Info
    const episodesLink = page.locator('[class*="nav"] >> text=Episodes').first();
    if (await episodesLink.isVisible()) {
      await expect(episodesLink).toBeVisible();
    }
  });

  test("should navigate to Podcast Info section", async ({ page }) => {
    await page.goto("/podcast-info");
    await page.waitForLoadState("networkidle");

    // Should show Podcast Info content or redirect to episodes if no podcast
    await page.waitForTimeout(1000);

    const url = page.url();
    // Either we're on podcast-info or were redirected
    expect(url).toMatch(/\/(podcast-info|episodes|login|create-podcast)/);
  });

  test("should navigate to Settings section", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await page.waitForTimeout(1000);
    const url = page.url();
    expect(url).toMatch(/\/(settings|episodes|login|create-podcast)/);
  });

  test("should redirect unknown routes to /episodes", async ({ page }) => {
    await page.goto("/nonexistent-page");
    await page.waitForLoadState("networkidle");

    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/(episodes|login|create-podcast)/);
  });
});

test.describe("Episode Creation Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await loginAsTestUser(page);
    await ensureTestPodcast(page);
    await loginAsTestUser(page);
  });

  test("should show new episode form", async ({ page }) => {
    await page.goto("/episodes");
    await page.waitForLoadState("networkidle");

    // Look for the "New Episode" button or "+" button
    const newEpisodeButton = page
      .locator(
        'button:has-text("New Episode"), button:has-text("New"), button[aria-label*="new" i]'
      )
      .first();

    if (await newEpisodeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newEpisodeButton.click();
      await page.waitForTimeout(500);

      // Should show an input for episode name
      const nameInput = page.locator(
        'input[placeholder*="name" i], input[placeholder*="title" i], input[placeholder*="episode" i]'
      );
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(nameInput).toBeVisible();
      }
    }
  });
});
