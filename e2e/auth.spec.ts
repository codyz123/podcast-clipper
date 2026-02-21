import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any stored auth state
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test("should show login page for unauthenticated users", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);

    // Should show the Podcastomatic branding
    await expect(page.locator("text=Podcastomatic")).toBeVisible();
    await expect(page.locator("text=Create viral podcast clips in minutes")).toBeVisible();

    // Should show login form
    await expect(page.locator("text=Welcome back")).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Sign in")')).toBeVisible();
  });

  test("should toggle between login and register forms", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Start on login form
    await expect(page.locator("text=Welcome back")).toBeVisible();

    // Switch to register
    await page.locator("text=Create one").click();
    await expect(page.locator("text=Create your account")).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();

    // Switch back to login
    await page.locator("text=Sign in").last().click();
    await expect(page.locator("text=Welcome back")).toBeVisible();
  });

  test("should show validation for empty login form", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Sign in button should be disabled when fields are empty
    const signInButton = page.locator('button:has-text("Sign in")');
    await expect(signInButton).toBeDisabled();
  });

  test("should show validation for mismatched passwords on register", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Switch to register
    await page.locator("text=Create one").click();

    // Fill in mismatched passwords
    await page.locator('input[name="name"]').fill("Test User");
    await page.locator('input[name="email"]').fill("test@example.com");
    await page.locator('input[name="password"]').fill("password123");
    await page.locator('input[name="confirmPassword"]').fill("different123");

    // Submit form
    const createButton = page.locator('button:has-text("Create account")');
    await createButton.click();

    // Should show error
    await expect(page.locator("text=Passwords do not match")).toBeVisible();
  });

  test("should show validation for short password on register", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Switch to register
    await page.locator("text=Create one").click();

    // Fill in short password
    await page.locator('input[name="name"]').fill("Test User");
    await page.locator('input[name="email"]').fill("test@example.com");
    await page.locator('input[name="password"]').fill("short");
    await page.locator('input[name="confirmPassword"]').fill("short");

    // Submit form
    const createButton = page.locator('button:has-text("Create account")');
    await createButton.click();

    // Should show error
    await expect(page.locator("text=Password must be at least 8 characters")).toBeVisible();
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Fill in invalid credentials
    await page.locator('input[name="email"]').fill("fake@example.com");
    await page.locator('input[name="password"]').fill("wrongpassword");

    // Submit
    await page.locator('button:has-text("Sign in")').click();

    // Should show error message
    await page.waitForTimeout(2000);
    const errorMessage = page.locator(".bg-red-50, .bg-red-900\\/20");
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });

  test("should show terms of service notice", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Terms of Service")).toBeVisible();
    await expect(page.locator("text=Privacy Policy")).toBeVisible();
  });
});
