import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { authRouter } from "../../routes/auth.js";

// Mock the database module
vi.mock("../../db/index.js", () => {
  // In-memory stores
  let mockUsers: Array<{
    id: string;
    email: string;
    passwordHash: string;
    name: string;
    avatarUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  let mockSessions: Array<{
    id: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    createdAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
  }> = [];

  let mockPodcastMembers: Array<{
    podcastId: string;
    userId: string;
    role: string;
  }> = [];

  let mockPodcasts: Array<{
    id: string;
    name: string;
    description: string | null;
  }> = [];

  // Helper to reset stores
  const resetStores = () => {
    mockUsers = [];
    mockSessions = [];
    mockPodcastMembers = [];
    mockPodcasts = [];
  };

  // Helper to add test data
  const addUser = (user: (typeof mockUsers)[0]) => mockUsers.push(user);
  const addSession = (session: (typeof mockSessions)[0]) => mockSessions.push(session);
  const getUsers = () => mockUsers;
  const getSessions = () => mockSessions;

  const generateId = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

  const db = {
    select: vi.fn((selectCols?: unknown) => ({
      from: vi.fn((table: unknown) => {
        const getTableData = () => {
          const tableName = (table as { _: { name: string } })?._?.name;
          if (tableName === "users") return mockUsers;
          if (tableName === "sessions") return mockSessions;
          if (tableName === "podcast_members") return mockPodcastMembers;
          if (tableName === "podcasts") return mockPodcasts;
          return [];
        };

        return {
          where: vi.fn(async () => {
            // Return filtered data based on select columns
            const data = getTableData();
            if (selectCols && Object.keys(selectCols as object).length > 0) {
              return data.map((item) => {
                const result: Record<string, unknown> = {};
                for (const key of Object.keys(selectCols as object)) {
                  result[key] = (item as Record<string, unknown>)[key];
                }
                return result;
              });
            }
            return data;
          }),
          innerJoin: vi.fn(() => ({
            where: vi.fn(async () => {
              // For podcast members joined with podcasts
              return mockPodcastMembers.map((pm) => ({
                ...pm,
                ...mockPodcasts.find((p) => p.id === pm.podcastId),
              }));
            }),
          })),
        };
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((data: Record<string, unknown>) => {
        const tableName = (table as { _: { name: string } })?._?.name;
        const id = generateId();
        const now = new Date();

        if (tableName === "users") {
          const newUser = {
            id,
            email: data.email as string,
            passwordHash: data.passwordHash as string,
            name: data.name as string,
            avatarUrl: null,
            createdAt: now,
            updatedAt: now,
          };
          mockUsers.push(newUser);
          return {
            returning: vi.fn(async () => [newUser]),
          };
        }

        if (tableName === "sessions") {
          const newSession = {
            id,
            userId: data.userId as string,
            refreshTokenHash: data.refreshTokenHash as string,
            expiresAt: data.expiresAt as Date,
            createdAt: now,
            userAgent: data.userAgent as string | null,
            ipAddress: data.ipAddress as string | null,
          };
          mockSessions.push(newSession);
          return {
            returning: vi.fn(async () => [newSession]),
          };
        }

        return {
          returning: vi.fn(async () => [{ id, ...data }]),
        };
      }),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn(async () => {
        const tableName = (table as { _: { name: string } })?._?.name;
        if (tableName === "sessions") {
          mockSessions = [];
        }
        return [];
      }),
    })),
    _test: {
      resetStores,
      addUser,
      addSession,
      getUsers,
      getSessions,
    },
  };

  return {
    db,
    users: { _: { name: "users" } },
    sessions: { _: { name: "sessions" } },
    podcasts: { _: { name: "podcasts" } },
    podcastMembers: { _: { name: "podcast_members" } },
    podcastInvitations: { _: { name: "podcast_invitations" } },
  };
});

// Mock email service
vi.mock("../../services/emailService.js", () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue({ success: true }),
}));

describe("Auth Routes Integration", () => {
  let app: express.Express;

  let dbModule: any;

  beforeAll(async () => {
    dbModule = await import("../../db/index.js");
  });

  beforeEach(() => {
    // Set up environment
    process.env.JWT_SECRET = "test-jwt-secret-key-12345";
    process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-key-67890";

    // Reset mock stores
    dbModule.db._test.resetStores();

    // Create fresh express app
    app = express();
    app.use(express.json());
    app.use("/api/auth", authRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user successfully", async () => {
      const response = await request(app).post("/api/auth/register").send({
        email: "newuser@example.com",
        password: "securePassword123",
        name: "New User",
      });

      expect(response.status).toBe(201);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe("newuser@example.com");
      expect(response.body.user.name).toBe("New User");
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.user.passwordHash).toBeUndefined(); // Should not expose hash
    });

    it("should reject registration with missing fields", async () => {
      const response = await request(app).post("/api/auth/register").send({
        email: "test@example.com",
        // missing password and name
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("required");
    });

    it("should reject registration with invalid email", async () => {
      const response = await request(app).post("/api/auth/register").send({
        email: "not-an-email",
        password: "securePassword123",
        name: "Test User",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("email");
    });

    it("should reject registration with short password", async () => {
      const response = await request(app).post("/api/auth/register").send({
        email: "test@example.com",
        password: "short",
        name: "Test User",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("8 characters");
    });

    it("should reject registration with empty name", async () => {
      const response = await request(app).post("/api/auth/register").send({
        email: "test@example.com",
        password: "securePassword123",
        name: "",
      });

      expect(response.status).toBe(400);
    });

    it("should normalize email to lowercase", async () => {
      const response = await request(app).post("/api/auth/register").send({
        email: "USER@EXAMPLE.COM",
        password: "securePassword123",
        name: "Test User",
      });

      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe("user@example.com");
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      // Add a test user
      const bcryptModule = await import("bcryptjs");
      const passwordHash = await bcryptModule.default.hash("correctPassword123", 10);
      dbModule.db._test.addUser({
        id: "existing-user-id",
        email: "existing@example.com",
        passwordHash,
        name: "Existing User",
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock the select to return this user
      dbModule.db.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => {
            return dbModule.db._test.getUsers();
          }),
        })),
      }));
    });

    it("should login with correct credentials", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "existing@example.com",
        password: "correctPassword123",
      });

      expect(response.status).toBe(200);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe("existing@example.com");
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
    });

    it("should reject login with wrong password", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "existing@example.com",
        password: "wrongPassword",
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid credentials");
    });

    it("should reject login with non-existent email", async () => {
      // Mock empty result for non-existent user
      dbModule.db.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => []),
        })),
      }));

      const response = await request(app).post("/api/auth/login").send({
        email: "nonexistent@example.com",
        password: "anyPassword",
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid credentials");
    });

    it("should reject login with missing fields", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "test@example.com",
        // missing password
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("required");
    });

    it("should normalize email to lowercase on login", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "EXISTING@EXAMPLE.COM",
        password: "correctPassword123",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("should reject refresh with missing token", async () => {
      const response = await request(app).post("/api/auth/refresh").send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Refresh token required");
    });

    it("should reject refresh with invalid token", async () => {
      const response = await request(app).post("/api/auth/refresh").send({
        refreshToken: "invalid-token",
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain("Invalid or expired");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should reject logout without authentication", async () => {
      const response = await request(app).post("/api/auth/logout");

      expect(response.status).toBe(401);
    });

    it("should logout successfully with valid token", async () => {
      // Generate a valid access token
      const { generateAccessToken } = await import("../../services/authService.js");
      const token = generateAccessToken("user-123", "test@example.com");

      const response = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("GET /api/auth/me", () => {
    it("should reject request without authentication", async () => {
      const response = await request(app).get("/api/auth/me");

      expect(response.status).toBe(401);
    });

    it("should return user data with valid token", async () => {
      // Add a test user
      const userId = "test-user-id";
      dbModule.db._test.addUser({
        id: userId,
        email: "test@example.com",
        passwordHash: "hash",
        name: "Test User",
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock the select to return this user
      dbModule.db.select.mockImplementation((cols: unknown) => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => {
            const users = dbModule.db._test.getUsers();
            if (cols && Object.keys(cols as object).length > 0) {
              return users.map(
                (u: {
                  id: string;
                  email: string;
                  name: string;
                  avatarUrl: string | null;
                  createdAt: Date;
                }) => ({
                  id: u.id,
                  email: u.email,
                  name: u.name,
                  avatarUrl: u.avatarUrl,
                  createdAt: u.createdAt,
                })
              );
            }
            return users;
          }),
          innerJoin: vi.fn(() => ({
            where: vi.fn(async () => []),
          })),
        })),
      }));

      // Generate a valid access token
      const { generateAccessToken } = await import("../../services/authService.js");
      const token = generateAccessToken(userId, "test@example.com");

      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe("test@example.com");
      expect(response.body.podcasts).toBeDefined();
    });
  });
});
