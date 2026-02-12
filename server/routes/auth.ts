import { Router, Request, Response } from "express";
import { db, users, podcasts, podcastMembers } from "../db/index.js";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  validateEmail,
  generateAccessToken,
  generateRefreshToken,
  createSession,
  invalidateAllUserSessions,
  verifyRefreshToken,
  processPendingInvitations,
} from "../services/authService.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";

export const authRouter = Router();

// POST /api/auth/register
authRouter.post("/register", authRateLimit, async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    // Validate input
    if (!email || !password || !name) {
      res.status(400).json({ error: "Email, password, and name are required" });
      return;
    }

    if (!validateEmail(email)) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.error });
      return;
    }

    if (name.length < 1 || name.length > 255) {
      res.status(400).json({ error: "Name must be 1-255 characters" });
      return;
    }

    // Check if user exists
    const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    if (existing.length > 0) {
      // Generic error to prevent email enumeration
      res.status(400).json({ error: "Unable to create account" });
      return;
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const [newUser] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        name: name.trim(),
      })
      .returning({ id: users.id, email: users.email, name: users.name });

    // Process any pending invitations
    await processPendingInvitations(newUser.id, newUser.email);

    // Generate tokens
    const accessToken = generateAccessToken(newUser.id, newUser.email);
    const refreshToken = generateRefreshToken(newUser.id);

    // Create session
    await createSession(newUser.id, refreshToken, req.headers["user-agent"], req.ip);

    res.status(201).json({
      user: { id: newUser.id, email: newUser.email, name: newUser.name },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Failed to create account" });
  }
});

// POST /api/auth/login
authRouter.post("/login", authRateLimit, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    // Find user
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));

    if (!user) {
      // Generic error to prevent email enumeration
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);

    // Create session
    await createSession(user.id, refreshToken, req.headers["user-agent"], req.ip);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/refresh
authRouter.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token required" });
      return;
    }

    // Verify refresh token
    const result = await verifyRefreshToken(refreshToken);
    if (!result) {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    // Get user
    const [user] = await db.select().from(users).where(eq(users.id, result.userId));
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Invalidate old session and create new one (token rotation)
    await invalidateAllUserSessions(user.id);

    // Generate new tokens
    const newAccessToken = generateAccessToken(user.id, user.email);
    const newRefreshToken = generateRefreshToken(user.id);

    await createSession(user.id, newRefreshToken, req.headers["user-agent"], req.ip);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({ error: "Failed to refresh token" });
  }
});

// POST /api/auth/logout
authRouter.post("/logout", jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // Invalidate all sessions for this user
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    await invalidateAllUserSessions(req.user.userId);
    res.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

// GET /api/auth/me
authRouter.get("/me", jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.user.userId));

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Get user's podcasts with member count
    const userPodcasts = await db
      .select({
        id: podcasts.id,
        name: podcasts.name,
        description: podcasts.description,
        coverImageUrl: podcasts.coverImageUrl,
        role: podcastMembers.role,
        createdAt: podcasts.createdAt,
      })
      .from(podcastMembers)
      .innerJoin(podcasts, eq(podcasts.id, podcastMembers.podcastId))
      .where(eq(podcastMembers.userId, user.id));

    res.json({ user, podcasts: userPodcasts });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});
