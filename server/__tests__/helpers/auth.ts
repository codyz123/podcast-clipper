import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * Test helpers for authentication
 *
 * Provides utilities for generating test tokens, users, and other auth-related data.
 */

// Default test secrets - these are only used in tests
export const TEST_JWT_SECRET = "test-jwt-secret-key-12345";
export const TEST_JWT_REFRESH_SECRET = "test-jwt-refresh-secret-key-67890";

// Set up test environment variables
export function setupTestEnv() {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_JWT_REFRESH_SECRET;
  process.env.ACCESS_CODE = "test-access-code";
  process.env.RESEND_API_KEY = ""; // Disable email sending in tests
}

// Generate a valid access token for testing
export function generateTestAccessToken(
  userId: string,
  email: string,
  expiresIn: string = "15m"
): string {
  return jwt.sign({ userId, email, type: "access" }, TEST_JWT_SECRET, {
    expiresIn,
  });
}

// Generate an expired access token for testing
export function generateExpiredAccessToken(userId: string, email: string): string {
  return jwt.sign({ userId, email, type: "access" }, TEST_JWT_SECRET, {
    expiresIn: "-1s",
  });
}

// Generate a valid refresh token for testing
export function generateTestRefreshToken(userId: string, expiresIn: string = "7d"): string {
  return jwt.sign({ userId, type: "refresh", jti: crypto.randomUUID() }, TEST_JWT_REFRESH_SECRET, {
    expiresIn,
  });
}

// Generate a hashed password for test users
export async function hashTestPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10); // Lower rounds for faster tests
}

// Generate a UUID for test entities
export function generateTestUUID(): string {
  return crypto.randomUUID();
}

// Create test user data
export interface TestUserData {
  id: string;
  email: string;
  name: string;
  password: string;
  passwordHash: string;
}

export async function createTestUserData(
  overrides: Partial<{ email: string; name: string; password: string }> = {}
): Promise<TestUserData> {
  const id = generateTestUUID();
  const email = overrides.email || `test-${id.slice(0, 8)}@example.com`;
  const name = overrides.name || `Test User ${id.slice(0, 8)}`;
  const password = overrides.password || "TestPassword123!";
  const passwordHash = await hashTestPassword(password);

  return { id, email, name, password, passwordHash };
}

// Create test podcast data
export interface TestPodcastData {
  id: string;
  name: string;
  description: string | null;
  createdById: string;
}

export function createTestPodcastData(
  createdById: string,
  overrides: Partial<{ name: string; description: string }> = {}
): TestPodcastData {
  const id = generateTestUUID();
  return {
    id,
    name: overrides.name || `Test Podcast ${id.slice(0, 8)}`,
    description: overrides.description || null,
    createdById,
  };
}

// Verify a token is valid and has expected claims
export function verifyTestAccessToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, TEST_JWT_SECRET) as {
      userId: string;
      email: string;
      type: string;
    };
    if (decoded.type !== "access") return null;
    return { userId: decoded.userId, email: decoded.email };
  } catch {
    return null;
  }
}

// Create authorization header value
export function authHeader(token: string): string {
  return `Bearer ${token}`;
}
