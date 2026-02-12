import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { toISOStringSafe } from "../utils/dates.js";

// Token data structure
export interface StoredToken {
  platform: "youtube" | "tiktok" | "instagram" | "x";
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  accountName: string;
  accountId?: string;
  createdAt: string;
  updatedAt: string;
}

// Get database connection
function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return neon(databaseUrl);
}

// Initialize database schema
export async function initializeDatabase(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id SERIAL PRIMARY KEY,
      platform VARCHAR(50) NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      account_name VARCHAR(255) NOT NULL,
      account_id VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  console.warn("[Database] OAuth tokens table initialized");
}

// Encryption using ACCESS_CODE as the key
function getEncryptionKey(): Buffer {
  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    throw new Error("ACCESS_CODE environment variable is required for token encryption");
  }
  return crypto.createHash("sha256").update(accessCode).digest();
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encryptedText] = encrypted.split(":");

  if (!ivHex || !authTagHex || !encryptedText) {
    throw new Error("Invalid encrypted token format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export async function saveToken(
  platform: StoredToken["platform"],
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
  accountName: string,
  accountId?: string
): Promise<void> {
  const sql = getDb();

  const encryptedAccess = encryptToken(accessToken);
  const encryptedRefresh = encryptToken(refreshToken);

  // Upsert: insert or update on conflict
  await sql`
    INSERT INTO oauth_tokens (platform, access_token, refresh_token, expires_at, account_name, account_id, updated_at)
    VALUES (${platform}, ${encryptedAccess}, ${encryptedRefresh}, ${expiresAt.toISOString()}, ${accountName}, ${accountId || null}, NOW())
    ON CONFLICT (platform)
    DO UPDATE SET
      access_token = ${encryptedAccess},
      refresh_token = ${encryptedRefresh},
      expires_at = ${expiresAt.toISOString()},
      account_name = ${accountName},
      account_id = ${accountId || null},
      updated_at = NOW()
  `;
}

export async function getToken(platform: StoredToken["platform"]): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  accountName: string;
  accountId?: string;
} | null> {
  const sql = getDb();

  const rows = await sql`
    SELECT access_token, refresh_token, expires_at, account_name, account_id
    FROM oauth_tokens
    WHERE platform = ${platform}
  `;

  if (rows.length === 0) {
    return null;
  }

  const token = rows[0];

  try {
    return {
      accessToken: decryptToken(token.access_token as string),
      refreshToken: decryptToken(token.refresh_token as string),
      expiresAt: new Date(token.expires_at as string),
      accountName: token.account_name as string,
      accountId: token.account_id as string | undefined,
    };
  } catch (error) {
    console.error(`Failed to decrypt token for ${platform}:`, error);
    return null;
  }
}

export async function updateToken(
  platform: StoredToken["platform"],
  accessToken: string,
  expiresAt: Date
): Promise<void> {
  const sql = getDb();

  const encryptedAccess = encryptToken(accessToken);

  // Check if token exists first
  const existing = await sql`
    SELECT 1 FROM oauth_tokens WHERE platform = ${platform}
  `;

  if (existing.length === 0) {
    throw new Error(`No token found for platform: ${platform}`);
  }

  await sql`
    UPDATE oauth_tokens
    SET access_token = ${encryptedAccess}, expires_at = ${expiresAt.toISOString()}, updated_at = NOW()
    WHERE platform = ${platform}
  `;
}

export async function deleteToken(platform: StoredToken["platform"]): Promise<void> {
  const sql = getDb();

  await sql`
    DELETE FROM oauth_tokens
    WHERE platform = ${platform}
  `;
}

export async function getAllTokenStatuses(): Promise<
  Array<{
    platform: StoredToken["platform"];
    connected: boolean;
    accountName?: string;
    expiresAt?: string;
  }>
> {
  const sql = getDb();

  const rows = await sql`
    SELECT platform, account_name, expires_at
    FROM oauth_tokens
  `;

  const platforms: StoredToken["platform"][] = ["youtube", "tiktok", "instagram", "x"];
  const tokenMap = new Map(rows.map((r) => [r.platform, r]));

  return platforms.map((platform) => {
    const token = tokenMap.get(platform);
    if (token) {
      const expiresAt = toISOStringSafe(token.expires_at) as string;
      return {
        platform,
        connected: true,
        accountName: token.account_name as string,
        expiresAt,
      };
    }
    return {
      platform,
      connected: false,
    };
  });
}

export async function isTokenExpired(platform: StoredToken["platform"]): Promise<boolean> {
  const token = await getToken(platform);
  if (!token) return true;

  // Consider expired if less than 5 minutes remaining
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes
  return token.expiresAt.getTime() - expiryBuffer < Date.now();
}
