import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { authMiddleware } from "../../middleware/auth.js";

describe("Auth Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let originalAccessCode: string | undefined;

  beforeEach(() => {
    // Save original env var
    originalAccessCode = process.env.ACCESS_CODE;

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

    // Set default access code
    process.env.ACCESS_CODE = "test-secret";
  });

  afterEach(() => {
    // Restore original env var
    if (originalAccessCode !== undefined) {
      process.env.ACCESS_CODE = originalAccessCode;
    } else {
      delete process.env.ACCESS_CODE;
    }
    vi.clearAllMocks();
  });

  it("should call next() with valid access code", () => {
    mockReq.headers = { "x-access-code": "test-secret" };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it("should return 401 when access code is missing", () => {
    mockReq.headers = {};

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "Access code required" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should return 403 when access code is invalid", () => {
    mockReq.headers = { "x-access-code": "wrong-code" };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "Invalid access code" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should return 500 when ACCESS_CODE env var is not set", () => {
    delete process.env.ACCESS_CODE;
    mockReq.headers = { "x-access-code": "any-code" };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "Server misconfigured" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should handle empty string access code in header", () => {
    mockReq.headers = { "x-access-code": "" };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    // Empty string is falsy, so should return 401
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "Access code required" });
  });

  it("should be case-sensitive for access codes", () => {
    process.env.ACCESS_CODE = "MySecret";
    mockReq.headers = { "x-access-code": "mysecret" };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
