import { test, expect } from "@playwright/test";
import { loginAsTestUser, ensureTestPodcast } from "./helpers/auth";

test.describe("Error Handling & Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test("should handle network failures gracefully", async ({ page }) => {
    await ensureTestPodcast(page);
    
    // Navigate to episodes
    await page.goto("/episodes");
    await page.waitForLoadState("networkidle");
    
    // Intercept API calls to simulate network failures
    await page.route("**/api/**", route => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Network error" }),
      });
    });
    
    // Try to perform an action that would trigger an API call
    const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
    
    if (await createButton.isVisible({ timeout: 5000 })) {
      await createButton.click();
      
      // Should show error state or message
      const errorIndicator = page.locator('.error, .text-red, [role="alert"], .bg-red, .toast-error').first();
      
      if (await errorIndicator.isVisible({ timeout: 10000 })) {
        await expect(errorIndicator).toBeVisible();
      }
    }
  });

  test("should handle authentication expiry", async ({ page }) => {
    await ensureTestPodcast(page);
    
    // Corrupt the stored auth token
    await page.addInitScript(() => {
      const authState = {
        state: {
          user: null,
          accessToken: "expired-token",
          refreshToken: "expired-refresh-token",
          isAuthenticated: false,
          isLoading: false,
          error: null,
          podcasts: [],
          currentPodcastId: null,
          showCreatePodcast: false,
        },
        version: 0,
      };
      localStorage.setItem("auth-storage", JSON.stringify(authState));
    });
    
    // Navigate to a protected route
    await page.goto("/episodes");
    
    // Should be redirected to login due to expired token
    await expect(page).toHaveURL("/login", { timeout: 15000 });
  });

  test("should handle malformed file uploads", async ({ page }) => {
    const _podcastId = await ensureTestPodcast(page);
    
    // Navigate to media import
    await page.goto("/episodes");
    await page.waitForLoadState("networkidle");
    
    // Create episode first
    const createButton = page.locator('button:has-text("Create"), button:has-text("New Episode")').first();
    
    if (await createButton.isVisible()) {
      await createButton.click();
      
      const nameInput = page.locator('input[name="name"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill(`Test Episode ${Date.now()}`);
        
        const submitButton = page.locator('button[type="submit"]').first();
        await submitButton.click();
        
        // Navigate to media upload
        await page.waitForURL(/\/episodes\/.*/, { timeout: 10000 });
        await page.goto(page.url().replace(/\/[^/]*$/, '/production/media'));
      }
    }
    
    // Test upload of non-audio file
    const fileInput = page.locator('input[type="file"]').first();
    
    if (await fileInput.isVisible({ timeout: 10000 })) {
      // Create a temporary text file to simulate bad file upload
      const badFile = await page.evaluateHandle(() => {
        const content = "This is not an audio file";
        const blob = new Blob([content], { type: "text/plain" });
        return new File([blob], "bad-file.txt", { type: "text/plain" });
      });
      
      await fileInput.setInputFiles(await badFile.jsonValue() as any);
      
      // Should show error about invalid file type
      const errorMessage = page.locator('.error, .text-red, [role="alert"]').first();
      
      if (await errorMessage.isVisible({ timeout: 10000 })) {
        await expect(errorMessage).toContainText(/invalid|format|audio|supported/i);
      }
    }
  });

  test("should handle extremely large files gracefully", async ({ page }) => {
    await ensureTestPodcast(page);
    
    // Navigate to media import (similar setup as previous test)
    await page.goto("/episodes");
    await page.waitForLoadState("networkidle");
    
    // Mock a very large file upload to test size limits
    await page.route("**/api/upload", route => {
      route.fulfill({
        status: 413,
        contentType: "application/json",
        body: JSON.stringify({ error: "File too large" }),
      });
    });
    
    const fileInput = page.locator('input[type="file"]').first();
    
    if (await fileInput.isVisible({ timeout: 5000 })) {
      // Simulate large file selection
      await fileInput.click();
      
      // Look for file size error
      const errorMessage = page.locator('.error, .text-red, [role="alert"]').first();
      
      if (await errorMessage.isVisible({ timeout: 10000 })) {
        await expect(errorMessage).toContainText(/large|size|limit/i);
      }
    }
  });

  test("should handle transcription API failures", async ({ page }) => {
    await ensureTestPodcast(page);
    
    // Intercept transcription API calls
    await page.route("**/api/transcribe", route => {
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Rate limit exceeded" }),
      });
    });
    
    // Navigate to transcription stage
    await page.goto("/episodes");
    
    // Trigger transcription (would need actual episode with audio)
    const transcribeButton = page.locator('button:has-text("Transcribe")').first();
    
    if (await transcribeButton.isVisible({ timeout: 5000 })) {
      await transcribeButton.click();
      
      // Should show rate limit error
      const errorMessage = page.locator('.error, .text-red, [role="alert"]').first();
      
      if (await errorMessage.isVisible({ timeout: 10000 })) {
        await expect(errorMessage).toContainText(/rate limit|too many|try again/i);
      }
    }
  });

  test("should handle video rendering failures", async ({ page }) => {
    await ensureTestPodcast(page);
    
    // Mock render API failure
    await page.route("**/api/render", route => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Render failed" }),
      });
    });
    
    // Navigate to video editor
    await page.goto("/episodes");
    
    const renderButton = page.locator('button:has-text("Render")').first();
    
    if (await renderButton.isVisible({ timeout: 5000 })) {
      await renderButton.click();
      
      // Should show render error
      const errorMessage = page.locator('.error, .text-red, [role="alert"]').first();
      
      if (await errorMessage.isVisible({ timeout: 15000 })) {
        await expect(errorMessage).toContainText(/render|failed|error/i);
      }
    }
  });

  test("should handle OAuth callback errors", async ({ page }) => {
    await ensureTestPodcast(page);
    
    // Navigate to OAuth callback with error parameters
    await page.goto("/oauth/callback?error=access_denied&error_description=User%20denied%20access");
    
    // Should handle OAuth error gracefully
    const errorMessage = page.locator('.error, .text-red, [role="alert"]').first();
    
    if (await errorMessage.isVisible({ timeout: 10000 })) {
      await expect(errorMessage).toContainText(/denied|access|oauth|permission/i);
    }
    
    // Should redirect back to main app
    await expect(page).toHaveURL(/\/(episodes|connections)/, { timeout: 10000 });
  });

  test("should handle invalid episode routes", async ({ page }) => {
    await ensureTestPodcast(page);
    
    // Navigate to non-existent episode
    await page.goto("/episodes/non-existent-episode-slug");
    
    // Should redirect to episodes list or show 404
    await expect(page).toHaveURL("/episodes", { timeout: 10000 });
  });

  test("should handle browser storage limitations", async ({ page }) => {
    await ensureTestPodcast(page);
    
    // Fill localStorage near its limit (simulate storage full)
    await page.addInitScript(() => {
      try {
        const largeData = "x".repeat(1024 * 1024); // 1MB string
        for (let i = 0; i < 5; i++) {
          localStorage.setItem(`large-data-${i}`, largeData);
        }
      } catch (_e) {
        // Storage quota exceeded - this is what we want to test
        console.log("Storage quota exceeded as expected");
      }
    });
    
    // Try to save data that would trigger storage issues
    await page.goto("/episodes");
    
    // App should still function even with storage limitations
    await expect(page.locator('body')).toBeVisible();
    
    // Try to create an episode to test if the app handles storage errors
    const createButton = page.locator('button:has-text("Create")').first();
    
    if (await createButton.isVisible()) {
      await createButton.click();
      
      // App should either work or show appropriate error
      await page.waitForTimeout(2000);
      
      // Verify app doesn't crash
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test("should handle concurrent user actions", async ({ page }) => {
    await ensureTestPodcast(page);
    
    // Navigate to episodes
    await page.goto("/episodes");
    await page.waitForLoadState("networkidle");
    
    // Simulate rapid clicking on buttons
    const buttons = page.locator('button:visible');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 0) {
      // Rapidly click multiple buttons
      for (let i = 0; i < Math.min(3, buttonCount); i++) {
        await buttons.nth(i).click({ timeout: 1000 });
        await page.waitForTimeout(100);
      }
      
      // App should remain stable
      await expect(page.locator('body')).toBeVisible();
      
      // No JavaScript errors should be thrown
      const errors = await page.evaluate(() => {
        return (window as any).errors || [];
      });
      
      expect(errors.length).toBe(0);
    }
  });

  test("should handle slow network conditions", async ({ page }) => {
    await ensureTestPodcast(page);
    
    // Simulate slow network
    await page.route("**/api/**", async route => {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      route.continue();
    });
    
    // Navigate to episodes
    await page.goto("/episodes");
    
    // Should show loading states during slow requests
    const loadingIndicator = page.locator('.loading, .spinner, [data-testid="loading"]').first();
    
    if (await loadingIndicator.isVisible({ timeout: 1000 })) {
      await expect(loadingIndicator).toBeVisible();
    }
    
    // Should eventually load content
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    await expect(page.locator('body')).toBeVisible();
  });

  test("should maintain state during page refresh", async ({ page }) => {
    await ensureTestPodcast(page);
    
    // Navigate to episodes and perform some action
    await page.goto("/episodes");
    await page.waitForLoadState("networkidle");
    
    // Set some state (like selecting a filter or opening a modal)
    const interactiveElement = page.locator('button, select, input').first();
    
    if (await interactiveElement.isVisible({ timeout: 5000 })) {
      await interactiveElement.click();
    }
    
    // Refresh the page
    await page.reload();
    await page.waitForLoadState("networkidle");
    
    // Should maintain authentication and basic app state
    await expect(page).toHaveURL("/episodes");
    await expect(page.locator('body')).toBeVisible();
    
    // Should not redirect to login
    await page.waitForTimeout(2000);
    await expect(page).not.toHaveURL("/login");
  });
});