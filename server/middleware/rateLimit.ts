import { Request, Response, NextFunction } from "express";

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};

// Clean up expired entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const key in store) {
      if (store[key].resetTime < now) {
        delete store[key];
      }
    }
  },
  5 * 60 * 1000
);

export function rateLimit(options: {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
}) {
  const { windowMs, max, keyGenerator } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator ? keyGenerator(req) : req.ip || "unknown";
    const now = Date.now();

    if (!store[key] || store[key].resetTime < now) {
      store[key] = { count: 1, resetTime: now + windowMs };
    } else {
      store[key].count++;
    }

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - store[key].count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(store[key].resetTime / 1000));

    if (store[key].count > max) {
      res.status(429).json({
        error: "Too many requests, please try again later",
        retryAfter: Math.ceil((store[key].resetTime - now) / 1000),
      });
      return;
    }

    next();
  };
}

// Preset for auth endpoints: 5 attempts per minute
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => `auth:${req.ip}:${req.body?.email || "unknown"}`,
});

// Preset for general API: 100 requests per minute
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
});
