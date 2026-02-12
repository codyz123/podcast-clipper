import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  jwtAuthMiddleware,
  optionalAuthMiddleware,
  authMiddleware,
} from "../../middleware/auth.js";
import { generateAccessToken } from "../../services/authService.js";

describe("JWT Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set up test environment
    process.env.JWT_SECRET = "test-jwt-secret-key-12345";
    process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-key-67890";
    process.env.ACCESS_CODE = "test-access-code";

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

  describe("jwtAuthMiddleware", () => {
    it("should call next() with valid JWT token", () => {
      const userId = "user-123";
      const email = "test@example.com";
      const token = generateAccessToken(userId, email);
      mockReq.headers = { authorization: `Bearer ${token}` };

      jwtAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual({ userId, email });
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should return 401 when authorization header is missing", () => {
      mockReq.headers = {};

      jwtAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when authorization header does not start with Bearer", () => {
      mockReq.headers = { authorization: "Basic abc123" };

      jwtAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when token is invalid", () => {
      mockReq.headers = { authorization: "Bearer invalid-token" };

      jwtAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Invalid or expired token",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when token is expired", async () => {
      const jwt = await import("jsonwebtoken");
      const expiredToken = jwt.default.sign(
        { userId: "user-123", email: "test@example.com", type: "access" },
        process.env.JWT_SECRET as string,
        { expiresIn: "-1s" }
      );
      mockReq.headers = { authorization: `Bearer ${expiredToken}` };

      jwtAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Invalid or expired token",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when using refresh token instead of access token", async () => {
      const jwt = await import("jsonwebtoken");
      const refreshToken = jwt.default.sign(
        { userId: "user-123", type: "refresh", jti: "unique-id" },
        process.env.JWT_SECRET as string, // Note: using JWT_SECRET instead of REFRESH_SECRET on purpose
        { expiresIn: "7d" }
      );
      mockReq.headers = { authorization: `Bearer ${refreshToken}` };

      jwtAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("optionalAuthMiddleware", () => {
    it("should attach user when valid token is present", () => {
      const userId = "user-123";
      const email = "test@example.com";
      const token = generateAccessToken(userId, email);
      mockReq.headers = { authorization: `Bearer ${token}` };

      optionalAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual({ userId, email });
    });

    it("should call next() without user when no authorization header", () => {
      mockReq.headers = {};

      optionalAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeUndefined();
    });

    it("should call next() without user when token is invalid", () => {
      mockReq.headers = { authorization: "Bearer invalid-token" };

      optionalAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeUndefined();
    });

    it("should call next() without user when authorization is not Bearer", () => {
      mockReq.headers = { authorization: "Basic abc123" };

      optionalAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeUndefined();
    });
  });

  describe("authMiddleware (hybrid)", () => {
    it("should accept valid JWT token", () => {
      const userId = "user-123";
      const email = "test@example.com";
      const token = generateAccessToken(userId, email);
      mockReq.headers = { authorization: `Bearer ${token}` };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual({ userId, email });
    });

    it("should accept valid access code when no JWT", () => {
      mockReq.headers = { "x-access-code": "test-access-code" };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should return 401 when neither JWT nor access code is valid", () => {
      mockReq.headers = {};

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should prefer JWT over access code when both present", () => {
      const userId = "user-123";
      const email = "test@example.com";
      const token = generateAccessToken(userId, email);
      mockReq.headers = {
        authorization: `Bearer ${token}`,
        "x-access-code": "test-access-code",
      };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual({ userId, email });
    });

    it("should fall back to access code when JWT is invalid", () => {
      mockReq.headers = {
        authorization: "Bearer invalid-token",
        "x-access-code": "test-access-code",
      };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should return 401 when JWT is invalid and access code is wrong", () => {
      mockReq.headers = {
        authorization: "Bearer invalid-token",
        "x-access-code": "wrong-code",
      };

      authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
