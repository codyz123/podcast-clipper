import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/authService.js";

// Extend Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { userId: string; email: string };
    }
  }
}

// JWT Authentication middleware - requires valid access token
export function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.substring(7);
  const decoded = verifyAccessToken(token);

  if (!decoded) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = decoded;
  next();
}

// Optional auth - attaches user if token present, but doesn't require it
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }

  next();
}

// Legacy access code middleware (kept for backwards compatibility during migration)
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // First try JWT auth
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    if (decoded) {
      req.user = decoded;
      next();
      return;
    }
  }

  // Fall back to access code for legacy support
  const accessCode = req.headers["x-access-code"] as string;
  const expectedCode = process.env.ACCESS_CODE;

  if (expectedCode && accessCode === expectedCode) {
    next();
    return;
  }

  // No valid auth found
  res.status(401).json({ error: "Authentication required" });
};
