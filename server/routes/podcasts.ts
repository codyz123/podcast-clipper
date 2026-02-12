import { Router, Request, Response } from "express";
import multer from "multer";
import { db, podcasts, podcastMembers, podcastInvitations, users } from "../db/index.js";
import { eq, and, gt } from "drizzle-orm";
import { jwtAuthMiddleware } from "../middleware/auth.js";
import { generateInvitationToken } from "../services/authService.js";
import { sendInvitationEmail, getEmailConfigStatus } from "../services/emailService.js";
import { uploadMedia } from "../lib/media-storage.js";

export const podcastsRouter = Router();

// Configure multer for cover image uploads (5MB limit)
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed"));
    }
  },
});

// Helper to extract string param (Express params can be string | string[])
function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

// All routes require authentication
podcastsRouter.use(jwtAuthMiddleware);

// GET /api/podcasts - List user's podcasts
podcastsRouter.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
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
      .where(eq(podcastMembers.userId, req.user.userId));

    res.json({ podcasts: userPodcasts });
  } catch (error) {
    console.error("List podcasts error:", error);
    res.status(500).json({ error: "Failed to list podcasts" });
  }
});

// POST /api/podcasts - Create new podcast
podcastsRouter.post("/", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const { name, description } = req.body;

    if (!name || name.length < 1 || name.length > 255) {
      res.status(400).json({ error: "Name is required (1-255 characters)" });
      return;
    }

    // Create podcast
    const [podcast] = await db
      .insert(podcasts)
      .values({
        name: name.trim(),
        description: description?.trim(),
        createdById: req.user.userId,
      })
      .returning();

    // Add creator as owner
    await db.insert(podcastMembers).values({
      podcastId: podcast.id,
      userId: req.user.userId,
      role: "owner",
    });

    res.status(201).json({ podcast: { ...podcast, role: "owner" } });
  } catch (error) {
    console.error("Create podcast error:", error);
    res.status(500).json({ error: "Failed to create podcast" });
  }
});

// GET /api/podcasts/:id - Get podcast with members
podcastsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const id = getParam(req.params.id);

    // Check membership
    const [membership] = await db
      .select()
      .from(podcastMembers)
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, req.user.userId)));

    if (!membership) {
      res.status(403).json({ error: "Not a member of this podcast" });
      return;
    }

    // Get podcast
    const [podcast] = await db.select().from(podcasts).where(eq(podcasts.id, id));
    if (!podcast) {
      res.status(404).json({ error: "Podcast not found" });
      return;
    }

    // Get members
    const members = await db
      .select({
        userId: podcastMembers.userId,
        role: podcastMembers.role,
        joinedAt: podcastMembers.joinedAt,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(podcastMembers)
      .innerJoin(users, eq(users.id, podcastMembers.userId))
      .where(eq(podcastMembers.podcastId, id));

    // Get pending invitations
    const invitations = await db
      .select({
        id: podcastInvitations.id,
        email: podcastInvitations.email,
        createdAt: podcastInvitations.createdAt,
        expiresAt: podcastInvitations.expiresAt,
      })
      .from(podcastInvitations)
      .where(
        and(eq(podcastInvitations.podcastId, id), gt(podcastInvitations.expiresAt, new Date()))
      );

    res.json({
      podcast,
      members,
      pendingInvitations: invitations,
      currentUserRole: membership.role,
    });
  } catch (error) {
    console.error("Get podcast error:", error);
    res.status(500).json({ error: "Failed to get podcast" });
  }
});

// PUT /api/podcasts/:id - Update podcast
podcastsRouter.put("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const id = getParam(req.params.id);
    const { name, description, coverImageUrl, podcastMetadata, brandColors } = req.body;

    // Check membership (only owner can update)
    const [membership] = await db
      .select()
      .from(podcastMembers)
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, req.user.userId)));

    if (!membership) {
      res.status(403).json({ error: "Not a member of this podcast" });
      return;
    }

    if (membership.role !== "owner") {
      res.status(403).json({ error: "Only owner can update podcast settings" });
      return;
    }

    // Update podcast
    const [updated] = await db
      .update(podcasts)
      .set({
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(coverImageUrl !== undefined && { coverImageUrl }),
        ...(podcastMetadata !== undefined && { podcastMetadata }),
        ...(brandColors !== undefined && { brandColors }),
        updatedAt: new Date(),
      })
      .where(eq(podcasts.id, id))
      .returning();

    res.json({ podcast: updated });
  } catch (error) {
    console.error("Update podcast error:", error);
    res.status(500).json({ error: "Failed to update podcast" });
  }
});

// POST /api/podcasts/:id/cover - Upload cover image
podcastsRouter.post(
  "/:id/cover",
  coverUpload.single("cover"),
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const id = getParam(req.params.id);

      // Verify ownership
      const [membership] = await db
        .select()
        .from(podcastMembers)
        .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, req.user.userId)));

      if (!membership || membership.role !== "owner") {
        res.status(403).json({ error: "Only owner can update cover image" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const { url } = await uploadMedia(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        `podcasts/${id}/cover`
      );

      // Update podcast with new cover URL
      const [updated] = await db
        .update(podcasts)
        .set({ coverImageUrl: url, updatedAt: new Date() })
        .where(eq(podcasts.id, id))
        .returning();

      res.json({ coverImageUrl: url, podcast: updated });
    } catch (error) {
      console.error("Cover upload error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: `Failed to upload: ${message}` });
    }
  }
);

// DELETE /api/podcasts/:id - Delete podcast
podcastsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const id = getParam(req.params.id);

    // Check ownership
    const [membership] = await db
      .select()
      .from(podcastMembers)
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, req.user.userId)));

    if (!membership || membership.role !== "owner") {
      res.status(403).json({ error: "Only owner can delete podcast" });
      return;
    }

    // Delete podcast (cascades to members, projects, etc.)
    await db.delete(podcasts).where(eq(podcasts.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error("Delete podcast error:", error);
    res.status(500).json({ error: "Failed to delete podcast" });
  }
});

// POST /api/podcasts/:id/invite - Invite user by email (any member can invite)
podcastsRouter.post("/:id/invite", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const id = getParam(req.params.id);
    const { email } = req.body;

    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "Valid email required" });
      return;
    }

    // Check membership and get podcast info
    const [membershipWithPodcast] = await db
      .select({
        membership: podcastMembers,
        podcastName: podcasts.name,
      })
      .from(podcastMembers)
      .innerJoin(podcasts, eq(podcasts.id, podcastMembers.podcastId))
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, req.user.userId)));

    if (!membershipWithPodcast) {
      res.status(403).json({ error: "Not a member of this podcast" });
      return;
    }

    // Get inviter's name
    const [inviter] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, req.user.userId));

    const inviterName = inviter?.name || "A team member";
    const podcastName = membershipWithPodcast.podcastName;

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already a member
    const existingMember = await db
      .select()
      .from(podcastMembers)
      .innerJoin(users, eq(users.id, podcastMembers.userId))
      .where(and(eq(podcastMembers.podcastId, id), eq(users.email, normalizedEmail)));

    if (existingMember.length > 0) {
      res.status(400).json({ error: "User is already a member" });
      return;
    }

    // Check if user exists
    const [existingUser] = await db.select().from(users).where(eq(users.email, normalizedEmail));

    if (existingUser) {
      // Add directly to podcast
      await db.insert(podcastMembers).values({
        podcastId: id,
        userId: existingUser.id,
        role: "member",
        invitedById: req.user.userId,
      });

      res.json({
        success: true,
        status: "added",
        message: "User added to podcast",
      });
    } else {
      // Check if invitation already exists
      const [existingInvitation] = await db
        .select()
        .from(podcastInvitations)
        .where(
          and(
            eq(podcastInvitations.podcastId, id),
            eq(podcastInvitations.email, normalizedEmail),
            gt(podcastInvitations.expiresAt, new Date())
          )
        );

      if (existingInvitation) {
        res.status(400).json({ error: "Invitation already sent to this email" });
        return;
      }

      // Create invitation for non-existent user
      const token = generateInvitationToken();
      await db.insert(podcastInvitations).values({
        podcastId: id,
        email: normalizedEmail,
        invitedById: req.user.userId,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      // Send invitation email
      const emailResult = await sendInvitationEmail({
        to: normalizedEmail,
        inviterName,
        podcastName,
        invitationToken: token,
      });

      res.json({
        success: true,
        status: "invited",
        message: emailResult.success
          ? "Invitation sent! They'll receive an email."
          : "Invitation created, but the email could not be sent.",
        emailSent: emailResult.success,
        emailError: emailResult.error,
        emailErrorCode: emailResult.errorCode,
        invitationUrl: emailResult.invitationUrl,
      });
    }
  } catch (error) {
    console.error("Invite error:", error);
    res.status(500).json({ error: "Failed to invite user" });
  }
});

// GET /api/podcasts/:id/email-config - Get email configuration status (for diagnostics)
podcastsRouter.get("/:id/email-config", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const id = getParam(req.params.id);

    // Check membership
    const [membership] = await db
      .select()
      .from(podcastMembers)
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, req.user.userId)));

    if (!membership) {
      res.status(403).json({ error: "Not a member of this podcast" });
      return;
    }

    // Only owners can see detailed config
    if (membership.role !== "owner") {
      res.status(403).json({ error: "Only owner can view email configuration" });
      return;
    }

    const status = getEmailConfigStatus();
    res.json({ emailConfig: status });
  } catch (error) {
    console.error("Get email config error:", error);
    res.status(500).json({ error: "Failed to get email config" });
  }
});

// POST /api/podcasts/:id/invitations/:invitationId/resend - Resend invitation email
podcastsRouter.post(
  "/:id/invitations/:invitationId/resend",
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const id = getParam(req.params.id);
      const invitationId = getParam(req.params.invitationId);
      console.warn("[Resend Invitation] podcastId:", id, "invitationId:", invitationId);

      // Check membership and get podcast info
      const [membershipWithPodcast] = await db
        .select({
          membership: podcastMembers,
          podcastName: podcasts.name,
        })
        .from(podcastMembers)
        .innerJoin(podcasts, eq(podcasts.id, podcastMembers.podcastId))
        .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, req.user.userId)));

      if (!membershipWithPodcast) {
        res.status(403).json({ error: "Not a member of this podcast" });
        return;
      }

      // Get the invitation
      const [invitation] = await db
        .select()
        .from(podcastInvitations)
        .where(
          and(
            eq(podcastInvitations.id, invitationId),
            eq(podcastInvitations.podcastId, id),
            gt(podcastInvitations.expiresAt, new Date())
          )
        );

      if (!invitation) {
        res.status(404).json({ error: "Invitation not found or expired" });
        return;
      }

      // Get inviter's name (use current user as the resender)
      const [inviter] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, req.user.userId));

      const inviterName = inviter?.name || "A team member";
      const podcastName = membershipWithPodcast.podcastName;

      // Send the invitation email
      console.warn(`[Resend Invitation] Sending email to ${invitation.email}`);
      const emailResult = await sendInvitationEmail({
        to: invitation.email,
        inviterName,
        podcastName,
        invitationToken: invitation.token,
      });

      res.json({
        success: emailResult.success,
        emailSent: emailResult.success,
        emailError: emailResult.error,
        errorCode: emailResult.errorCode,
        invitationUrl: emailResult.invitationUrl,
        message: emailResult.success
          ? "Invitation email sent!"
          : `Email could not be sent: ${emailResult.error}`,
      });
    } catch (error) {
      console.error("Resend invitation error:", error);
      res.status(500).json({ error: "Failed to resend invitation" });
    }
  }
);

// DELETE /api/podcasts/:id/invitations/:invitationId - Cancel invitation
podcastsRouter.delete("/:id/invitations/:invitationId", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const id = getParam(req.params.id);
    const invitationId = getParam(req.params.invitationId);
    console.warn("[Cancel Invitation] podcastId:", id, "invitationId:", invitationId);

    // Check membership
    const [membership] = await db
      .select()
      .from(podcastMembers)
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, req.user.userId)));

    if (!membership) {
      res.status(403).json({ error: "Not a member of this podcast" });
      return;
    }

    const result = await db
      .delete(podcastInvitations)
      .where(and(eq(podcastInvitations.id, invitationId), eq(podcastInvitations.podcastId, id)))
      .returning();

    console.warn("[Cancel Invitation] Deleted rows:", result.length);
    res.json({ success: true });
  } catch (error) {
    console.error("Cancel invitation error:", error);
    res.status(500).json({ error: "Failed to cancel invitation" });
  }
});

// DELETE /api/podcasts/:id/members/:userId - Remove member
podcastsRouter.delete("/:id/members/:userId", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const id = getParam(req.params.id);
    const userId = getParam(req.params.userId);

    // Check requester's membership
    const [requesterMembership] = await db
      .select()
      .from(podcastMembers)
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, req.user.userId)));

    if (!requesterMembership) {
      res.status(403).json({ error: "Not a member of this podcast" });
      return;
    }

    // Check target's membership
    const [targetMembership] = await db
      .select()
      .from(podcastMembers)
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, userId)));

    if (!targetMembership) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    // Rules:
    // 1. Owner can remove anyone except themselves
    // 2. Members can only remove themselves (leave)
    // 3. Owner cannot leave (must transfer or delete podcast)

    const isSelf = userId === req.user.userId;
    const isOwner = requesterMembership.role === "owner";
    const targetIsOwner = targetMembership.role === "owner";

    if (targetIsOwner && isSelf) {
      res.status(400).json({
        error: "Owner cannot leave. Transfer ownership or delete the podcast.",
      });
      return;
    }

    if (!isOwner && !isSelf) {
      res.status(403).json({ error: "Only owners can remove other members" });
      return;
    }

    // Remove member
    await db
      .delete(podcastMembers)
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, userId)));

    res.json({ success: true });
  } catch (error) {
    console.error("Remove member error:", error);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

// POST /api/podcasts/:id/transfer-ownership - Transfer ownership to another member
podcastsRouter.post("/:id/transfer-ownership", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const id = getParam(req.params.id);
    const { newOwnerId } = req.body;

    if (!newOwnerId) {
      res.status(400).json({ error: "New owner ID required" });
      return;
    }

    // Check requester's ownership
    const [requesterMembership] = await db
      .select()
      .from(podcastMembers)
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, req.user.userId)));

    if (!requesterMembership || requesterMembership.role !== "owner") {
      res.status(403).json({ error: "Only owner can transfer ownership" });
      return;
    }

    // Check new owner is a member
    const [newOwnerMembership] = await db
      .select()
      .from(podcastMembers)
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, newOwnerId)));

    if (!newOwnerMembership) {
      res.status(400).json({ error: "New owner must be a current member" });
      return;
    }

    // Update roles
    await db
      .update(podcastMembers)
      .set({ role: "member" })
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, req.user.userId)));

    await db
      .update(podcastMembers)
      .set({ role: "owner" })
      .where(and(eq(podcastMembers.podcastId, id), eq(podcastMembers.userId, newOwnerId)));

    res.json({ success: true });
  } catch (error) {
    console.error("Transfer ownership error:", error);
    res.status(500).json({ error: "Failed to transfer ownership" });
  }
});
