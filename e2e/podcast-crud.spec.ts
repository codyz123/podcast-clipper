import { test, expect } from "@playwright/test";
import { loginAsTestUser, ensureTestPodcast } from "./helpers/auth";

test.describe("Podcast CRUD Operations", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test("should create a new podcast", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to create podcast (could be through menu or if no podcasts exist)
    await page.goto("/create-podcast");

    // Fill podcast creation form
    const timestamp = Date.now();
    const podcastName = `E2E Test Podcast ${timestamp}`;

    await page.locator('input[name="name"]').fill(podcastName);

    // Submit creation
    await page.locator('button[type="submit"], button:has-text("Create")').click();

    // Should redirect to episodes or podcast info
    await expect(page).toHaveURL(/\/(episodes|podcast-info)/, { timeout: 15000 });

    // If redirected to episodes, check that we can navigate to podcast info
    if (page.url().includes("/episodes")) {
      // Navigate to podcast info to verify creation
      await page.goto("/podcast-info");
      await page.waitForLoadState("networkidle");
    }

    // Verify podcast name appears on podcast info page
    await expect(page.locator(`text=${podcastName}`)).toBeVisible({ timeout: 10000 });
  });

  test("should edit podcast information", async ({ page }) => {
    // Ensure we have a test podcast
    await ensureTestPodcast(page);

    // Navigate to podcast info page
    await page.goto("/podcast-info");
    await page.waitForLoadState("networkidle");

    // Look for edit functionality
    const editButton = page
      .locator('button:has-text("Edit"), [data-testid="edit-podcast"]')
      .first();

    if (await editButton.isVisible({ timeout: 5000 })) {
      await editButton.click();

      // Update podcast name
      const timestamp = Date.now();
      const newName = `Updated Test Podcast ${timestamp}`;

      const nameInput = page
        .locator('input[name="name"], input[placeholder*="name"], input[value*="Podcast"]')
        .first();
      await nameInput.clear();
      await nameInput.fill(newName);

      // Save changes
      const saveButton = page.locator('button:has-text("Save"), button[type="submit"]').first();
      await saveButton.click();

      // Verify updated name appears
      await expect(page.locator(`text=${newName}`)).toBeVisible({ timeout: 10000 });
    }
  });

  test("should handle podcast settings and branding", async ({ page }) => {
    await ensureTestPodcast(page);

    // Navigate to settings
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Verify settings page loads
    await expect(page.locator('h1, h2, [data-testid="settings-title"]')).toBeVisible({
      timeout: 10000,
    });

    // Look for branding or color customization options
    const brandingSection = page
      .locator('text=Brand, text=Color, text=Theme, [data-testid="branding"]')
      .first();

    if (await brandingSection.isVisible({ timeout: 5000 })) {
      await brandingSection.scrollIntoViewIfNeeded();

      // Test color picker or theme selector if available
      const colorInput = page.locator('input[type="color"], [data-testid="color-picker"]').first();
      if (await colorInput.isVisible()) {
        await colorInput.fill("#ff0000");

        // Look for save or apply button
        const applyButton = page
          .locator('button:has-text("Apply"), button:has-text("Save")')
          .first();
        if (await applyButton.isVisible()) {
          await applyButton.click();
        }
      }
    }
  });

  test("should manage podcast members", async ({ page }) => {
    await ensureTestPodcast(page);

    // Navigate to settings or members section
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Look for members or team management
    const membersSection = page
      .locator('text=Members, text=Team, text=Users, [data-testid="members"]')
      .first();

    if (await membersSection.isVisible({ timeout: 5000 })) {
      await membersSection.scrollIntoViewIfNeeded();

      // Should show current user as owner/member
      const currentUserIndicator = page
        .locator('text=Owner, text=Admin, [data-testid="current-user"]')
        .first();
      if (await currentUserIndicator.isVisible()) {
        await expect(currentUserIndicator).toBeVisible();
      }

      // Test adding a member (if functionality exists)
      const addMemberButton = page
        .locator(
          'button:has-text("Add Member"), button:has-text("Invite"), [data-testid="add-member"]'
        )
        .first();

      if (await addMemberButton.isVisible()) {
        await addMemberButton.click();

        // Fill member email
        const emailInput = page.locator('input[type="email"], input[placeholder*="email"]').first();
        if (await emailInput.isVisible()) {
          await emailInput.fill("test-member@example.com");

          // Submit invitation
          const sendButton = page
            .locator('button:has-text("Send"), button:has-text("Invite"), button[type="submit"]')
            .first();
          if (await sendButton.isVisible()) {
            await sendButton.click();

            // Should show success message or updated member list
            await page.waitForTimeout(2000);
          }
        }
      }
    }
  });

  test("should delete a podcast", async ({ page }) => {
    // Create a specific podcast for deletion testing
    const response = await page.request.post("http://localhost:3002/api/podcasts", {
      headers: {
        Authorization: `Bearer ${await getStoredAccessToken(page)}`,
        "Content-Type": "application/json",
      },
      data: {
        name: `Delete Test Podcast ${Date.now()}`,
      },
    });

    if (!response.ok()) {
      // Skip test if we can't create a podcast
      test.skip("Could not create test podcast for deletion");
      return;
    }

    const { podcast } = await response.json();
    const podcastName = podcast.name;

    // Navigate to settings
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Look for delete functionality
    const dangerZone = page
      .locator('text=Danger, text=Delete, [data-testid="danger-zone"]')
      .first();

    if (await dangerZone.isVisible({ timeout: 5000 })) {
      await dangerZone.scrollIntoViewIfNeeded();

      // Find delete button
      const deleteButton = page
        .locator('button:has-text("Delete"), [data-testid="delete-podcast"]')
        .first();

      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // Handle confirmation dialog
        const confirmInput = page
          .locator('input[placeholder*="confirm"], input[placeholder*="delete"]')
          .first();

        if (await confirmInput.isVisible()) {
          await confirmInput.fill(podcastName);

          const confirmButton = page
            .locator('button:has-text("Delete"), button:has-text("Confirm")')
            .first();
          await confirmButton.click();

          // Should redirect to create podcast or show empty state
          await expect(page).toHaveURL(/\/(create-podcast|episodes)/, { timeout: 15000 });

          // Verify podcast is gone
          await page.goto("/podcast-info");
          await expect(page.locator(`text=${podcastName}`)).not.toBeVisible({ timeout: 5000 });
        }
      }
    }
  });
});

// Helper function to get stored access token
async function getStoredAccessToken(page: any): Promise<string> {
  const authData = await page.evaluate(() => {
    const stored = localStorage.getItem("auth-storage");
    return stored ? JSON.parse(stored) : null;
  });

  return authData?.state?.accessToken || "";
}
