import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { authMiddleware } from "../../middleware/auth.js";

/**
 * Tests for the hybrid authMiddleware that supports both JWT and access code authentication.
 *
 * The middleware tries JWT first, then falls back to access code for legacy support.
 */
describe("Auth Middleware (Hybrid)", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set up test environment
    process.env.JWT_SECRET = "test-jwt-secret-key-12345";
    process.env.ACCESS_CODE = "test-secret";

    // Set up mock request
    mockReq = {
      headers: {},
    };

    // Set up mock response
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    // Set up mock next
    mockNext = vi.fn();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  describe("JWT Authentication", () => {
    it("should call next() with valid JWT token and attach user", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign(
        { userId: "user-123", email: "test@example.com", type: "access" },
        process.env.JWT_SECRET as string,
        { expiresIn: "15m" }
      );
      mockReq.headers = { authorization: `Bearer ${token}` };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual({
        userId: "user-123",
        email: "test@example.com",
      });
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should return 401 when JWT token is invalid", () => {
      mockReq.headers = { authorization: "Bearer invalid-token" };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      // Falls through to access code check, which also fails
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when JWT token is expired", async () => {
      const jwt = await import("jsonwebtoken");
      const expiredToken = jwt.default.sign(
        { userId: "user-123", email: "test@example.com", type: "access" },
        process.env.JWT_SECRET as string,
        { expiresIn: "-1s" }
      );
      mockReq.headers = { authorization: `Bearer ${expiredToken}` };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("Access Code Fallback", () => {
    it("should call next() with valid access code (legacy support)", () => {
      mockReq.headers = { "x-access-code": "test-secret" };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      // Note: user is not attached with access code auth
      expect(mockReq.user).toBeUndefined();
    });

    it("should fall back to access code when JWT is invalid", () => {
      mockReq.headers = {
        authorization: "Bearer invalid-token",
        "x-access-code": "test-secret",
      };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should return 401 when both JWT and access code are missing", () => {
      mockReq.headers = {};

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when access code is invalid and no JWT", () => {
      mockReq.headers = { "x-access-code": "wrong-code" };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when access code is empty", () => {
      mockReq.headers = { "x-access-code": "" };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Authentication required",
      });
    });

    it("should be case-sensitive for access codes", () => {
      process.env.ACCESS_CODE = "MySecret";
      mockReq.headers = { "x-access-code": "mysecret" };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("Priority", () => {
    it("should prefer valid JWT over valid access code", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign(
        { userId: "jwt-user", email: "jwt@example.com", type: "access" },
        process.env.JWT_SECRET as string,
        { expiresIn: "15m" }
      );
      mockReq.headers = {
        authorization: `Bearer ${token}`,
        "x-access-code": "test-secret",
      };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual({
        userId: "jwt-user",
        email: "jwt@example.com",
      });
    });
  });
});
