import type { Page } from "@playwright/test";

const API_BASE = "http://localhost:3002";

/**
 * Test credentials for E2E testing.
 * These will be created on first use if they don't exist.
 */
export const TEST_USER = {
  name: "E2E Test User",
  email: "e2e-test@podcastomatic.test",
  password: "e2e-test-password-123",
};

/**
 * Register a test user via the API. Silently ignores if user already exists.
 */
export async function ensureTestUser(page: Page): Promise<void> {
  try {
    await page.request.post(`${API_BASE}/api/auth/register`, {
      data: {
        name: TEST_USER.name,
        email: TEST_USER.email,
        password: TEST_USER.password,
      },
    });
  } catch {
    // User may already exist — that's fine
  }
}

/**
 * Log in as the test user via the API and inject auth state into localStorage.
 * This avoids going through the UI login flow for every test.
 */
export async function loginAsTestUser(page: Page): Promise<void> {
  await ensureTestUser(page);

  const response = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: {
      email: TEST_USER.email,
      password: TEST_USER.password,
    },
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  }

  const { user, accessToken, refreshToken } = await response.json();

  // Fetch podcasts
  const podcastsRes = await page.request.get(`${API_BASE}/api/podcasts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let podcasts: Array<{ id: string; name: string }> = [];
  let currentPodcastId: string | null = null;
  if (podcastsRes.ok()) {
    const body = await podcastsRes.json();
    podcasts = body.podcasts || [];
    currentPodcastId = podcasts.length > 0 ? podcasts[0].id : null;
  }

  // Inject auth state into localStorage before navigation
  await page.addInitScript(
    ({ user, accessToken, refreshToken, podcasts, currentPodcastId }) => {
      const authState = {
        state: {
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
          error: null,
          podcasts,
          currentPodcastId,
          showCreatePodcast: false,
        },
        version: 0,
      };
      localStorage.setItem("auth-storage", JSON.stringify(authState));
    },
    { user, accessToken, refreshToken, podcasts, currentPodcastId }
  );
}

/**
 * Create a test podcast if none exists, and return its ID.
 */
export async function ensureTestPodcast(page: Page): Promise<string> {
  // First, login to get a token
  await ensureTestUser(page);

  const loginRes = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: {
      email: TEST_USER.email,
      password: TEST_USER.password,
    },
  });

  const { accessToken } = await loginRes.json();

  // Check for existing podcasts
  const podcastsRes = await page.request.get(`${API_BASE}/api/podcasts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const { podcasts } = await podcastsRes.json();

  if (podcasts && podcasts.length > 0) {
    return podcasts[0].id;
  }

  // Create a podcast
  const createRes = await page.request.post(`${API_BASE}/api/podcasts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    data: {
      name: "E2E Test Podcast",
    },
  });

  if (!createRes.ok()) {
    throw new Error(`Failed to create podcast: ${createRes.status()}`);
  }

  const created = await createRes.json();
  return created.podcast?.id || created.id;
}
