export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface Podcast {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  role: "owner" | "member";
  createdAt: string;
}

export interface PodcastMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: "owner" | "member";
  joinedAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

export interface PodcastDetails extends Podcast {
  members: PodcastMember[];
  pendingInvitations: PendingInvitation[];
  currentUserRole: "owner" | "member";
  podcastMetadata?: {
    showName?: string;
    author?: string;
    category?: string;
    language?: string;
    explicit?: boolean;
    email?: string;
    website?: string;
  };
  brandColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
