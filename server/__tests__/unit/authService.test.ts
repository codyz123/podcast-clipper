import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  validatePassword,
  validateEmail,
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  generateInvitationToken,
  encryptToken,
  decryptToken,
} from "../../services/authService.js";
import jwt from "jsonwebtoken";

describe("Auth Service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret-key-12345";
    process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-key-67890";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("validatePassword", () => {
    it("should accept valid passwords (8+ characters)", () => {
      expect(validatePassword("password123")).toEqual({ valid: true });
      expect(validatePassword("12345678")).toEqual({ valid: true });
      expect(validatePassword("a".repeat(128))).toEqual({ valid: true });
    });

    it("should reject passwords shorter than 8 characters", () => {
      const result = validatePassword("short");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 8 characters");
    });

    it("should reject passwords longer than 128 characters", () => {
      const result = validatePassword("a".repeat(129));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("less than 128 characters");
    });

    it("should reject empty passwords", () => {
      const result = validatePassword("");
      expect(result.valid).toBe(false);
    });
  });

  describe("validateEmail", () => {
    it("should accept valid email formats", () => {
      expect(validateEmail("user@example.com")).toBe(true);
      expect(validateEmail("user.name@example.co.uk")).toBe(true);
      expect(validateEmail("user+tag@example.com")).toBe(true);
      expect(validateEmail("123@456.com")).toBe(true);
    });

    it("should reject invalid email formats", () => {
      expect(validateEmail("notanemail")).toBe(false);
      expect(validateEmail("missing@domain")).toBe(false);
      expect(validateEmail("@nodomain.com")).toBe(false);
      expect(validateEmail("spaces in@email.com")).toBe(false);
      expect(validateEmail("")).toBe(false);
    });

    it("should reject emails longer than 255 characters", () => {
      const longEmail = "a".repeat(250) + "@example.com";
      expect(validateEmail(longEmail)).toBe(false);
    });
  });

  describe("hashPassword / verifyPassword", () => {
    it("should hash and verify passwords correctly", async () => {
      const password = "mySecurePassword123";
      const hash = await hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]?\$/); // bcrypt hash format

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should reject wrong passwords", async () => {
      const hash = await hashPassword("correctPassword");
      const isValid = await verifyPassword("wrongPassword", hash);
      expect(isValid).toBe(false);
    });

    it("should produce different hashes for same password", async () => {
      const password = "samePassword";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2); // Salt should make them different
    });
  });

  describe("generateAccessToken", () => {
    it("should generate a valid JWT access token", () => {
      const userId = "user-123";
      const email = "test@example.com";

      const token = generateAccessToken(userId, email);

      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");

      // Verify the token
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
        userId: string;
        email: string;
        type: string;
      };

      expect(decoded.userId).toBe(userId);
      expect(decoded.email).toBe(email);
      expect(decoded.type).toBe("access");
    });

    it("should throw if JWT_SECRET is not configured", () => {
      delete process.env.JWT_SECRET;

      expect(() => generateAccessToken("user-123", "test@example.com")).toThrow(
        "JWT_SECRET not configured"
      );
    });
  });

  describe("generateRefreshToken", () => {
    it("should generate a valid JWT refresh token", () => {
      const userId = "user-123";

      const token = generateRefreshToken(userId);

      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");

      // Verify the token
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET as string) as {
        userId: string;
        type: string;
        jti: string;
      };

      expect(decoded.userId).toBe(userId);
      expect(decoded.type).toBe("refresh");
      expect(decoded.jti).toBeTruthy(); // Should have a unique identifier
    });

    it("should throw if JWT_REFRESH_SECRET is not configured", () => {
      delete process.env.JWT_REFRESH_SECRET;

      expect(() => generateRefreshToken("user-123")).toThrow("JWT_REFRESH_SECRET not configured");
    });

    it("should generate unique tokens each time", () => {
      const token1 = generateRefreshToken("user-123");
      const token2 = generateRefreshToken("user-123");

      expect(token1).not.toBe(token2);
    });
  });

  describe("verifyAccessToken", () => {
    it("should verify a valid access token", () => {
      const userId = "user-123";
      const email = "test@example.com";
      const token = generateAccessToken(userId, email);

      const result = verifyAccessToken(token);

      expect(result).toEqual({ userId, email });
    });

    it("should return null for invalid tokens", () => {
      expect(verifyAccessToken("invalid-token")).toBeNull();
      expect(verifyAccessToken("")).toBeNull();
    });

    it("should return null for expired tokens", () => {
      const token = jwt.sign(
        { userId: "user-123", email: "test@example.com", type: "access" },
        process.env.JWT_SECRET as string,
        { expiresIn: "-1s" }
      );

      expect(verifyAccessToken(token)).toBeNull();
    });

    it("should return null for refresh tokens (wrong type)", () => {
      const token = generateRefreshToken("user-123");
      // Try to verify as access token
      const result = verifyAccessToken(token);
      expect(result).toBeNull();
    });

    it("should return null if JWT_SECRET is not configured", () => {
      const token = generateAccessToken("user-123", "test@example.com");
      delete process.env.JWT_SECRET;

      expect(verifyAccessToken(token)).toBeNull();
    });
  });

  describe("generateInvitationToken", () => {
    it("should generate a 64-character hex string", () => {
      const token = generateInvitationToken();

      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate unique tokens each time", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateInvitationToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe("encryptToken / decryptToken", () => {
    it("should encrypt and decrypt tokens correctly", () => {
      const originalToken = "my-secret-oauth-token-12345";

      const encrypted = encryptToken(originalToken);
      const decrypted = decryptToken(encrypted);

      expect(encrypted).not.toBe(originalToken);
      expect(encrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/); // iv:authTag:encrypted format
      expect(decrypted).toBe(originalToken);
    });

    it("should produce different ciphertexts for same plaintext", () => {
      const token = "same-token";

      const encrypted1 = encryptToken(token);
      const encrypted2 = encryptToken(token);

      expect(encrypted1).not.toBe(encrypted2); // Different IVs
      expect(decryptToken(encrypted1)).toBe(token);
      expect(decryptToken(encrypted2)).toBe(token);
    });

    it("should throw on invalid encrypted format", () => {
      expect(() => decryptToken("invalid")).toThrow("Invalid encrypted token format");
      expect(() => decryptToken("only:two")).toThrow("Invalid encrypted token format");
    });

    it("should throw if JWT_SECRET is not configured", () => {
      delete process.env.JWT_SECRET;

      expect(() => encryptToken("token")).toThrow("JWT_SECRET environment variable is required");
    });
  });
});
