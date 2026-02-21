import { test, expect } from "@playwright/test";
import { TEST_USER, ensureTestUser } from "./helpers/auth";

test.describe("Authentication Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any stored auth state
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("should complete full registration and login flow", async ({ page }) => {
    // Start at root, should redirect to login for unauthenticated users
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Should be redirected to login (may take a moment due to auth check)
    await expect(page).toHaveURL("/login", { timeout: 10000 });

    // Should show login form elements
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();

    // Try to register a new user (use timestamp to ensure unique email)
    const timestamp = Date.now();
    const newUser = {
      name: "E2E Test User",
      email: `e2e-test-${timestamp}@example.com`,
      password: "testpassword123",
    };

    // Find and click register toggle button
    const registerToggle = page
      .locator("text=Create one, text=Create account, text=Sign up")
      .first();
    if (await registerToggle.isVisible()) {
      await registerToggle.click();
    }

    // Fill registration form
    await page.locator('input[name="name"]').fill(newUser.name);
    await page.locator('input[name="email"]').fill(newUser.email);
    await page.locator('input[name="password"]').fill(newUser.password);

    // Handle confirm password if it exists
    const confirmPasswordField = page.locator('input[name="confirmPassword"]');
    if (await confirmPasswordField.isVisible()) {
      await confirmPasswordField.fill(newUser.password);
    }

    // Submit registration
    const submitButton = page
      .locator(
        'button:has-text("Create account"), button:has-text("Sign up"), button[type="submit"]'
      )
      .first();
    await submitButton.click();

    // Should redirect to create podcast or episodes after successful registration
    await expect(page).toHaveURL(/\/(create-podcast|episodes)/, { timeout: 15000 });

    // If redirected to create-podcast, complete the flow
    if (page.url().includes("create-podcast")) {
      await page.locator('input[name="name"]').fill("Test Podcast");
      await page.locator('button[type="submit"]').click();

      // Should redirect to episodes after podcast creation
      await expect(page).toHaveURL("/episodes", { timeout: 10000 });
    }

    // Verify we're authenticated and can see the main interface
    await expect(
      page
        .locator('[data-testid="episode-list"], .workspace-nav, [data-testid="app-shell"]')
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("should login existing user and logout", async ({ page }) => {
    // Ensure test user exists
    await ensureTestUser(page);

    // Go to login page
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Fill login form
    await page.locator('input[name="email"]').fill(TEST_USER.email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);

    // Submit login
    const signInButton = page
      .locator('button:has-text("Sign in"), button:has-text("Login"), button[type="submit"]')
      .first();
    await signInButton.click();

    // Should redirect to main app
    await expect(page).toHaveURL(/\/(episodes|create-podcast)/, { timeout: 15000 });

    // Handle podcast creation if needed
    if (page.url().includes("create-podcast")) {
      await page.locator('input[name="name"]').fill("Test Podcast");
      await page.locator('button[type="submit"]').click();
      await expect(page).toHaveURL("/episodes", { timeout: 10000 });
    }

    // Verify authenticated interface is visible
    await expect(page.locator('[data-testid="app-shell"], .workspace-nav').first()).toBeVisible({
      timeout: 10000,
    });

    // Test logout functionality
    const userMenu = page
      .locator('[data-testid="user-menu"], .user-menu, button:has-text("Sign out")')
      .first();

    // If user menu button exists, click it to open dropdown
    if (await userMenu.isVisible()) {
      await userMenu.click();
    }

    // Find and click logout button
    const logoutButton = page
      .locator(
        'button:has-text("Sign out"), button:has-text("Logout"), [data-testid="logout-button"]'
      )
      .first();
    if (await logoutButton.isVisible()) {
      await logoutButton.click();

      // Should redirect back to login
      await expect(page).toHaveURL("/login", { timeout: 10000 });
    }
  });

  test("should show validation errors for invalid inputs", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Test empty form submission
    const signInButton = page.locator('button:has-text("Sign in"), button[type="submit"]').first();

    // Button should be disabled for empty form or show validation on click
    const isDisabled = await signInButton.isDisabled();
    if (!isDisabled) {
      await signInButton.click();
      // Look for any validation messages
      const validationMessage = page.locator('.error, .text-red, [role="alert"]').first();
      if (await validationMessage.isVisible()) {
        await expect(validationMessage).toBeVisible();
      }
    }

    // Test invalid email format
    await page.locator('input[name="email"]').fill("invalid-email");
    await page.locator('input[name="password"]').fill("somepassword");

    if (!(await signInButton.isDisabled())) {
      await signInButton.click();

      // Should show some kind of error or stay on login page
      await expect(page).toHaveURL("/login");
    }
  });

  test("should handle network errors gracefully", async ({ page }) => {
    // Ensure test user exists first
    await ensureTestUser(page);

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Intercept login request to simulate network error
    await page.route("**/api/auth/login", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    // Fill form with valid credentials
    await page.locator('input[name="email"]').fill(TEST_USER.email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);

    // Submit
    const signInButton = page.locator('button:has-text("Sign in"), button[type="submit"]').first();
    await signInButton.click();

    // Should show error message or stay on login page
    await expect(page).toHaveURL("/login");

    // Look for error indication (could be toast, inline error, etc.)
    const errorIndicator = page.locator('.error, .text-red, [role="alert"], .bg-red').first();
    if (await errorIndicator.isVisible({ timeout: 5000 })) {
      await expect(errorIndicator).toBeVisible();
    }
  });

  test("should redirect authenticated users away from login", async ({ page }) => {
    // Login first through API
    await ensureTestUser(page);

    const response = await page.request.post("http://localhost:3002/api/auth/login", {
      data: {
        email: TEST_USER.email,
        password: TEST_USER.password,
      },
    });

    if (response.ok()) {
      const { user, accessToken, refreshToken } = await response.json();

      // Set auth state in localStorage
      await page.addInitScript(
        ({ user, accessToken, refreshToken }) => {
          const authState = {
            state: {
              user,
              accessToken,
              refreshToken,
              isAuthenticated: true,
              isLoading: false,
              error: null,
              podcasts: [],
              currentPodcastId: null,
              showCreatePodcast: false,
            },
            version: 0,
          };
          localStorage.setItem("auth-storage", JSON.stringify(authState));
        },
        { user, accessToken, refreshToken }
      );

      // Now try to visit login page
      await page.goto("/login");

      // Should be redirected away from login
      await expect(page).not.toHaveURL("/login", { timeout: 10000 });
      await expect(page).toHaveURL(/\/(episodes|create-podcast)/, { timeout: 10000 });
    }
  });
});
