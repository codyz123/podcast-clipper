import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

// Generate UUIDs for testing
const generateId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

// Test IDs
const ownerId = "owner-user-id";
const memberId = "member-user-id";
const testPodcastId = "test-podcast-id";

// Mock data stores - these will be manipulated by tests
let mockPodcasts: Array<{
  id: string;
  name: string;
  description: string | null;
  createdById: string;
  coverImageUrl: string | null;
  podcastMetadata: Record<string, unknown> | null;
  brandColors: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}> = [];

let mockPodcastMembers: Array<{
  podcastId: string;
  userId: string;
  role: string;
  invitedById: string | null;
  joinedAt: Date;
}> = [];

let mockPodcastInvitations: Array<{
  id: string;
  podcastId: string;
  email: string;
  invitedById: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
}> = [];

let mockUsers: Array<{
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}> = [];

// Reset stores function
const resetStores = () => {
  mockPodcasts = [];
  mockPodcastMembers = [];
  mockPodcastInvitations = [];
  mockUsers = [];
};

// Helper to create chainable mock
const createChainableMock = (returnValue: unknown) => {
  const chainable: Record<string, unknown> = {};
  chainable.from = vi.fn(() => chainable);
  chainable.where = vi.fn(() => Promise.resolve(returnValue));
  chainable.innerJoin = vi.fn(() => chainable);
  chainable.returning = vi.fn(() => Promise.resolve(returnValue));
  chainable.onConflictDoNothing = vi.fn(() => Promise.resolve());
  chainable.values = vi.fn(() => chainable);
  chainable.set = vi.fn(() => chainable);
  return chainable;
};

// Mock the database module
vi.mock("../../db/index.js", () => {
  // Create the mock db object that will be configured per test
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  return {
    db,
    podcasts: { _: { name: "podcasts" } },
    podcastMembers: { _: { name: "podcast_members" } },
    podcastInvitations: { _: { name: "podcast_invitations" } },
    users: { _: { name: "users" } },
  };
});

// Mock drizzle-orm operators - they're used in routes
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ type: "eq", a, b })),
  and: vi.fn((...args) => ({ type: "and", args })),
  gt: vi.fn((a, b) => ({ type: "gt", a, b })),
}));

// Mock email service
vi.mock("../../services/emailService.js", () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock auth service invitation token
vi.mock("../../services/authService.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as object),
    generateInvitationToken: vi.fn().mockReturnValue("mock-invitation-token-12345"),
  };
});

describe("Podcast Routes Integration", () => {
  let app: express.Express;
  let ownerToken: string;
  let memberToken: string;

  let dbModule: any;

  beforeAll(async () => {
    // Set up environment
    process.env.JWT_SECRET = "test-jwt-secret-key-12345";
    process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-key-67890";

    // Import modules
    dbModule = await import("../../db/index.js");

    // Generate tokens using the real function
    const jwt = await import("jsonwebtoken");
    ownerToken = jwt.default.sign(
      { userId: ownerId, email: "owner@example.com", type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    memberToken = jwt.default.sign(
      { userId: memberId, email: "member@example.com", type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
  });

  beforeEach(async () => {
    resetStores();

    // Reset all mocks
    vi.clearAllMocks();

    // Add test users
    mockUsers.push(
      { id: ownerId, email: "owner@example.com", name: "Owner User", avatarUrl: null },
      { id: memberId, email: "member@example.com", name: "Member User", avatarUrl: null }
    );

    // Create fresh express app
    app = express();
    app.use(express.json());

    // Import router fresh
    const { podcastsRouter } = await import("../../routes/podcasts.js");
    app.use("/api/podcasts", podcastsRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to setup mock for listing podcasts
  const setupListPodcastsMock = () => {
    dbModule.db.select.mockImplementation(() => {
      const chain = createChainableMock([]);
      chain.from = vi.fn(() => {
        chain.innerJoin = vi.fn(() => {
          chain.where = vi.fn(() =>
            Promise.resolve(
              mockPodcastMembers
                .filter((pm) => pm.userId === ownerId)
                .map((pm) => {
                  const podcast = mockPodcasts.find((p) => p.id === pm.podcastId);
                  return {
                    id: podcast?.id,
                    name: podcast?.name,
                    description: podcast?.description,
                    coverImageUrl: podcast?.coverImageUrl,
                    role: pm.role,
                    createdAt: podcast?.createdAt,
                  };
                })
            )
          );
          return chain;
        });
        return chain;
      });
      return chain;
    });
  };

  // Helper to setup mocks for getting a single podcast
  const setupGetPodcastMock = (userId: string) => {
    let callCount = 0;
    dbModule.db.select.mockImplementation(() => {
      callCount++;
      const chain = createChainableMock([]);

      if (callCount === 1) {
        // First call: check membership
        chain.from = vi.fn(() => {
          chain.where = vi.fn(() => {
            const membership = mockPodcastMembers.find(
              (m) => m.podcastId === testPodcastId && m.userId === userId
            );
            return Promise.resolve(membership ? [membership] : []);
          });
          return chain;
        });
      } else if (callCount === 2) {
        // Second call: get podcast
        chain.from = vi.fn(() => {
          chain.where = vi.fn(() => {
            const podcast = mockPodcasts.find((p) => p.id === testPodcastId);
            return Promise.resolve(podcast ? [podcast] : []);
          });
          return chain;
        });
      } else if (callCount === 3) {
        // Third call: get members with user join
        chain.from = vi.fn(() => {
          chain.innerJoin = vi.fn(() => {
            chain.where = vi.fn(() =>
              Promise.resolve(
                mockPodcastMembers
                  .filter((m) => m.podcastId === testPodcastId)
                  .map((m) => {
                    const user = mockUsers.find((u) => u.id === m.userId);
                    return {
                      userId: m.userId,
                      role: m.role,
                      joinedAt: m.joinedAt,
                      name: user?.name,
                      email: user?.email,
                      avatarUrl: user?.avatarUrl,
                    };
                  })
              )
            );
            return chain;
          });
          return chain;
        });
      } else {
        // Fourth call: get invitations
        chain.from = vi.fn(() => {
          chain.where = vi.fn(() =>
            Promise.resolve(
              mockPodcastInvitations.filter(
                (i) => i.podcastId === testPodcastId && i.expiresAt > new Date()
              )
            )
          );
          return chain;
        });
      }
      return chain;
    });
  };

  // Helper to setup mocks for creating a podcast
  const setupCreatePodcastMock = () => {
    dbModule.db.insert.mockImplementation(() => {
      const chain = createChainableMock([]);
      chain.values = vi.fn((data: Record<string, unknown>) => {
        const id = generateId();
        const now = new Date();

        if (data.name) {
          // Creating podcast
          const newPodcast = {
            id,
            name: data.name as string,
            description: (data.description as string) || null,
            createdById: data.createdById as string,
            coverImageUrl: null,
            podcastMetadata: null,
            brandColors: null,
            createdAt: now,
            updatedAt: now,
          };
          mockPodcasts.push(newPodcast);
          chain.returning = vi.fn(() => Promise.resolve([{ ...newPodcast, role: "owner" }]));
        } else if (data.podcastId && data.userId) {
          // Creating membership
          const newMember = {
            podcastId: data.podcastId as string,
            userId: data.userId as string,
            role: data.role as string,
            invitedById: null,
            joinedAt: now,
          };
          mockPodcastMembers.push(newMember);
          chain.returning = vi.fn(() => Promise.resolve([newMember]));
        }
        return chain;
      });
      return chain;
    });
  };

  describe("GET /api/podcasts", () => {
    it("should reject request without authentication", async () => {
      const response = await request(app).get("/api/podcasts");

      expect(response.status).toBe(401);
    });

    it("should return empty list when user has no podcasts", async () => {
      setupListPodcastsMock();

      const response = await request(app)
        .get("/api/podcasts")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.podcasts).toEqual([]);
    });

    it("should return user's podcasts", async () => {
      // Add a podcast with the user as member
      mockPodcasts.push({
        id: testPodcastId,
        name: "Test Podcast",
        description: "A test podcast",
        createdById: ownerId,
        coverImageUrl: null,
        podcastMetadata: null,
        brandColors: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPodcastMembers.push({
        podcastId: testPodcastId,
        userId: ownerId,
        role: "owner",
        invitedById: null,
        joinedAt: new Date(),
      });

      setupListPodcastsMock();

      const response = await request(app)
        .get("/api/podcasts")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.podcasts).toHaveLength(1);
      expect(response.body.podcasts[0].name).toBe("Test Podcast");
    });
  });

  describe("POST /api/podcasts", () => {
    beforeEach(() => {
      setupCreatePodcastMock();
    });

    it("should create a new podcast", async () => {
      const response = await request(app)
        .post("/api/podcasts")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "New Podcast",
          description: "A brand new podcast",
        });

      expect(response.status).toBe(201);
      expect(response.body.podcast).toBeDefined();
      expect(response.body.podcast.name).toBe("New Podcast");
    });

    it("should reject creation without name", async () => {
      const response = await request(app)
        .post("/api/podcasts")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          description: "No name provided",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Name");
    });

    it("should reject creation with empty name", async () => {
      const response = await request(app)
        .post("/api/podcasts")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "",
        });

      expect(response.status).toBe(400);
    });

    it("should reject creation with name too long", async () => {
      const response = await request(app)
        .post("/api/podcasts")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "a".repeat(256),
        });

      expect(response.status).toBe(400);
    });

    it("should trim whitespace from name", async () => {
      const response = await request(app)
        .post("/api/podcasts")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "  Trimmed Podcast  ",
        });

      expect(response.status).toBe(201);
      expect(response.body.podcast.name).toBe("Trimmed Podcast");
    });
  });

  describe("GET /api/podcasts/:id", () => {
    beforeEach(() => {
      // Set up test podcast
      mockPodcasts.push({
        id: testPodcastId,
        name: "Test Podcast",
        description: "A test podcast",
        createdById: ownerId,
        coverImageUrl: null,
        podcastMetadata: null,
        brandColors: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPodcastMembers.push({
        podcastId: testPodcastId,
        userId: ownerId,
        role: "owner",
        invitedById: null,
        joinedAt: new Date(),
      });
    });

    it("should return podcast details for member", async () => {
      setupGetPodcastMock(ownerId);

      const response = await request(app)
        .get(`/api/podcasts/${testPodcastId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.podcast).toBeDefined();
      expect(response.body.members).toBeDefined();
      expect(response.body.pendingInvitations).toBeDefined();
      expect(response.body.currentUserRole).toBe("owner");
    });

    it("should reject access for non-member", async () => {
      // Remove the membership
      mockPodcastMembers = [];
      setupGetPodcastMock(ownerId);

      const response = await request(app)
        .get(`/api/podcasts/${testPodcastId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("Not a member");
    });
  });

  describe("DELETE /api/podcasts/:id", () => {
    beforeEach(() => {
      // Set up test podcast with owner
      mockPodcasts.push({
        id: testPodcastId,
        name: "Test Podcast",
        description: "A test podcast",
        createdById: ownerId,
        coverImageUrl: null,
        podcastMetadata: null,
        brandColors: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPodcastMembers.push({
        podcastId: testPodcastId,
        userId: ownerId,
        role: "owner",
        invitedById: null,
        joinedAt: new Date(),
      });
    });

    it("should allow owner to delete podcast", async () => {
      // Mock for membership check (owner)
      dbModule.db.select.mockImplementation(() => {
        const chain = createChainableMock([]);
        chain.from = vi.fn(() => {
          chain.where = vi.fn(() =>
            Promise.resolve([{ podcastId: testPodcastId, userId: ownerId, role: "owner" }])
          );
          return chain;
        });
        return chain;
      });

      dbModule.db.delete.mockImplementation(() => {
        const chain = createChainableMock([]);
        chain.where = vi.fn(() => Promise.resolve([]));
        return chain;
      });

      const response = await request(app)
        .delete(`/api/podcasts/${testPodcastId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should not allow member to delete podcast", async () => {
      // Mock for membership check (member, not owner)
      dbModule.db.select.mockImplementation(() => {
        const chain = createChainableMock([]);
        chain.from = vi.fn(() => {
          chain.where = vi.fn(() =>
            Promise.resolve([{ podcastId: testPodcastId, userId: ownerId, role: "member" }])
          );
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .delete(`/api/podcasts/${testPodcastId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("Only owner");
    });
  });

  describe("DELETE /api/podcasts/:id/members/:userId", () => {
    beforeEach(() => {
      // Set up test podcast with owner and member
      mockPodcasts.push({
        id: testPodcastId,
        name: "Test Podcast",
        description: "A test podcast",
        createdById: ownerId,
        coverImageUrl: null,
        podcastMetadata: null,
        brandColors: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPodcastMembers.push(
        {
          podcastId: testPodcastId,
          userId: ownerId,
          role: "owner",
          invitedById: null,
          joinedAt: new Date(),
        },
        {
          podcastId: testPodcastId,
          userId: memberId,
          role: "member",
          invitedById: ownerId,
          joinedAt: new Date(),
        }
      );
    });

    it("should allow owner to remove a member", async () => {
      let callCount = 0;
      dbModule.db.select.mockImplementation(() => {
        callCount++;
        const chain = createChainableMock([]);
        chain.from = vi.fn(() => {
          chain.where = vi.fn(() => {
            if (callCount === 1) {
              // Requester's membership (owner)
              return Promise.resolve([
                { podcastId: testPodcastId, userId: ownerId, role: "owner" },
              ]);
            } else {
              // Target's membership (member being removed)
              return Promise.resolve([
                { podcastId: testPodcastId, userId: memberId, role: "member" },
              ]);
            }
          });
          return chain;
        });
        return chain;
      });

      dbModule.db.delete.mockImplementation(() => {
        const chain = createChainableMock([]);
        chain.where = vi.fn(() => Promise.resolve([]));
        return chain;
      });

      const response = await request(app)
        .delete(`/api/podcasts/${testPodcastId}/members/${memberId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should allow member to leave (remove self)", async () => {
      let callCount = 0;
      dbModule.db.select.mockImplementation(() => {
        callCount++;
        const chain = createChainableMock([]);
        chain.from = vi.fn(() => {
          chain.where = vi.fn(() => {
            if (callCount === 1) {
              // Requester's membership (member)
              return Promise.resolve([
                { podcastId: testPodcastId, userId: memberId, role: "member" },
              ]);
            } else {
              // Target's membership (same member leaving)
              return Promise.resolve([
                { podcastId: testPodcastId, userId: memberId, role: "member" },
              ]);
            }
          });
          return chain;
        });
        return chain;
      });

      dbModule.db.delete.mockImplementation(() => {
        const chain = createChainableMock([]);
        chain.where = vi.fn(() => Promise.resolve([]));
        return chain;
      });

      const response = await request(app)
        .delete(`/api/podcasts/${testPodcastId}/members/${memberId}`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should not allow member to remove another member", async () => {
      const otherUserId = "other-user-id";
      mockPodcastMembers.push({
        podcastId: testPodcastId,
        userId: otherUserId,
        role: "member",
        invitedById: ownerId,
        joinedAt: new Date(),
      });

      let callCount = 0;
      dbModule.db.select.mockImplementation(() => {
        callCount++;
        const chain = createChainableMock([]);
        chain.from = vi.fn(() => {
          chain.where = vi.fn(() => {
            if (callCount === 1) {
              // Requester's membership (member trying to remove)
              return Promise.resolve([
                { podcastId: testPodcastId, userId: memberId, role: "member" },
              ]);
            } else {
              // Target's membership (other member being targeted)
              return Promise.resolve([
                { podcastId: testPodcastId, userId: otherUserId, role: "member" },
              ]);
            }
          });
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .delete(`/api/podcasts/${testPodcastId}/members/${otherUserId}`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("Only owners");
    });

    it("should not allow owner to remove themselves", async () => {
      dbModule.db.select.mockImplementation(() => {
        const chain = createChainableMock([]);
        chain.from = vi.fn(() => {
          chain.where = vi.fn(() => {
            // Both calls return owner (trying to remove self)
            return Promise.resolve([{ podcastId: testPodcastId, userId: ownerId, role: "owner" }]);
          });
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .delete(`/api/podcasts/${testPodcastId}/members/${ownerId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Owner cannot leave");
    });
  });
});
