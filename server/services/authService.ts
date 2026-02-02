import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db, sessions, podcastInvitations, podcastMembers } from "../db/index.js";
import { eq, and, gt } from "drizzle-orm";

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// Password validation
export function validatePassword(password: string): {
  valid: boolean;
  error?: string;
} {
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  if (password.length > 128) {
    return { valid: false, error: "Password must be less than 128 characters" };
  }
  return { valid: true };
}

// Email validation
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(userId: string, email: string): string {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET not configured");
  return jwt.sign({ userId, email, type: "access" }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

export function generateRefreshToken(userId: string): string {
  if (!process.env.JWT_REFRESH_SECRET) throw new Error("JWT_REFRESH_SECRET not configured");
  return jwt.sign(
    { userId, type: "refresh", jti: crypto.randomUUID() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

export async function createSession(
  userId: string,
  refreshToken: string,
  userAgent?: string,
  ip?: string
): Promise<void> {
  const tokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
  await db.insert(sessions).values({
    userId,
    refreshTokenHash: tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    userAgent: userAgent?.substring(0, 500), // Truncate long user agents
    ipAddress: ip?.substring(0, 45),
  });
}

export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function verifyAccessToken(token: string): { userId: string; email: string } | null {
  if (!process.env.JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
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

export async function verifyRefreshToken(
  token: string
): Promise<{ userId: string; sessionId: string } | null> {
  if (!process.env.JWT_REFRESH_SECRET) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET) as {
      userId: string;
      type: string;
      jti: string;
    };
    if (decoded.type !== "refresh") return null;

    // Find valid session
    const userSessions = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, decoded.userId), gt(sessions.expiresAt, new Date())));

    // Check if token matches any session
    for (const session of userSessions) {
      const matches = await bcrypt.compare(token, session.refreshTokenHash);
      if (matches) {
        return { userId: decoded.userId, sessionId: session.id };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Process pending invitations when user registers
export async function processPendingInvitations(userId: string, email: string): Promise<void> {
  const invitations = await db
    .select()
    .from(podcastInvitations)
    .where(
      and(
        eq(podcastInvitations.email, email.toLowerCase()),
        gt(podcastInvitations.expiresAt, new Date())
      )
    );

  for (const invitation of invitations) {
    // Add user to podcast
    await db
      .insert(podcastMembers)
      .values({
        podcastId: invitation.podcastId,
        userId,
        role: "member",
        invitedById: invitation.invitedById,
      })
      .onConflictDoNothing(); // In case they're already a member

    // Delete the invitation
    await db.delete(podcastInvitations).where(eq(podcastInvitations.id, invitation.id));
  }
}

// Generate invitation token
export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Encrypt tokens for secure storage (for OAuth tokens)
export function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required for token encryption");
  }
  return crypto.createHash("sha256").update(secret).digest();
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
