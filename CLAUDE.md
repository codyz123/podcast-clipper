# Podcastomatic — Agent Instructions

## What This Is
Web app for creating short-form video clips from podcast episodes. Import audio → AI transcribe → select clips → render videos with animated subtitles → publish to social platforms. Built for a small trusted group (3-7 podcast collaborators).

## Quick Start
```bash
npm install          # Auto-pulls env vars from Vercel via postinstall hook
npm run dev:all      # Starts Vite frontend + Express backend concurrently
# Frontend: http://localhost:1420  |  Backend: http://localhost:3001
```

If env setup fails: `vercel env pull .env.local` or copy `.env.example`.

## Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Radix UI, Zustand
- **Video Rendering**: Remotion (programmatic video generation)
- **Backend**: Express (Node.js), Drizzle ORM, PostgreSQL
- **AI**: OpenAI Whisper (transcription), GPT-4 (clip suggestions)
- **Storage**: Cloudflare R2 (media files), PostgreSQL (metadata)
- **Auth**: JWT (access + refresh tokens), email/password
- **Social Publishing**: YouTube, Instagram, TikTok, X (OAuth2 flows)
- **Hosting**: Railway (backend), Vercel (frontend)
- **Testing**: Vitest (unit/integration), Playwright (e2e)

## Architecture

```
src/              → React frontend (Vite)
├── components/   → UI components (by feature domain)
├── pages/        → Route pages (OAuthCallback, VideoTestPage)
├── stores/       → Zustand stores (auth, editor, project, publish, settings, workspace)
├── services/     → API client + platform-specific upload services
├── hooks/        → Custom hooks (episodes, podcast, rendering, keyboard shortcuts)
├── remotion/     → Video composition & subtitle animation
│   ├── Composition.tsx      → Single-camera video composition
│   ├── MulticamComposition.tsx → Multi-camera video composition
│   ├── SubtitleAnimation.tsx → Animated subtitle rendering
│   ├── overlays/            → Speaker labels, waveforms, CTAs
│   └── templates/           → Visual templates for different styles
└── types/        → Shared TypeScript types

server/           → Express backend
├── index.ts      → Server entry point
├── db/
│   ├── schema.ts → Drizzle schema (21 tables — users, podcasts, episodes, clips, etc.)
│   └── index.ts  → Database connection
├── routes/       → API route handlers (one file per domain)
│   ├── auth.ts, podcasts.ts, episodes.ts, transcribe.ts
│   ├── render.ts, analyze-clips.ts, generate-snippet.ts
│   ├── uploads.ts, video-sources.ts, text-snippets.ts
│   ├── youtube-upload.ts, instagram-upload.ts, tiktok-upload.ts, x-upload.ts
│   ├── oauth.ts, upload-events.ts
│   ├── podcast-branding-assets.ts, podcast-people.ts, projects.ts
│   └── ... (each file = one REST resource)
├── lib/          → Shared utilities
│   ├── r2-storage.ts        → Cloudflare R2 file operations
│   ├── media-storage.ts     → Media file management
│   ├── video-processing.ts  → FFmpeg video operations
│   ├── audio-converter.ts   → Audio format conversion
│   ├── audio-sync.ts        → Audio synchronization
│   ├── process-manager.ts   → Background process management
│   ├── *-upload.ts          → Platform-specific upload logic (YouTube, IG, TikTok, X)
│   ├── oauth-providers/     → OAuth2 configs per platform
│   └── token-storage.ts     → OAuth token management
├── middleware/    → Auth, rate limiting, podcast access control
├── services/     → Auth service, email service
└── __tests__/    → Unit, integration, e2e tests

shared/           → Code shared between frontend and backend
├── computeWordGroups.ts  → Word grouping for subtitle display
├── clipTransform.ts      → Clip timing transformations
└── multicamTransform.ts  → Multi-camera layout calculations

docs/             → Documentation
├── ARCHITECTURE.md  → System architecture & backend plan
└── AUDIT.md         → Security/code audit notes
```

## Database (21 tables in Drizzle)
Key entities: `users`, `sessions`, `podcasts`, `podcastMembers`, `projects`, `transcripts`, `clips`, `textSnippets`, `renderedClips`, `mediaAssets`, `videoSources`, `podcastPeople`, `podcastBrandingAssets`
Social uploads: `youtubeUploads`, `instagramUploads`, `tiktokUploads`, `xUploads`, `uploadEvents`, `oauthTokens`
Schema: `server/db/schema.ts` (1000+ lines)

## Key Workflows
1. **Audio Import** → upload to R2 → create episode record
2. **Transcription** → OpenAI Whisper → word-level timestamps → stored in DB
3. **Clip Selection** → AI suggests clips (GPT-4) or manual selection → clip timing data
4. **Video Rendering** → Remotion compositions with subtitles, speaker overlays, templates
5. **Publishing** → OAuth2 flow per platform → upload via platform APIs → track status via upload events

## Video Formats
- 9:16 Vertical (1080×1920) — TikTok, Reels, Shorts
- 1:1 Square (1080×1080) — Instagram Posts, X
- 16:9 Landscape (1920×1080) — YouTube, X, LinkedIn

## Testing
```bash
npm test              # All server tests (Vitest)
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests
npm run test:e2e      # Playwright browser tests
npm run test:parity   # Client-side render parity tests
npm run test:all      # Everything (typecheck + lint + all tests)
```

## Code Conventions
- One route file per REST resource in `server/routes/`
- Zustand stores in `src/stores/` — one per domain
- Feature-based component folders in `src/components/`
- Shared logic between client/server goes in `shared/`
- OAuth providers configured in `server/lib/oauth-providers/`

## Deployment
- **Backend**: Railway (`railway.json` — Nixpacks build, healthcheck at `/api/health`)
- **Frontend**: Vercel
- **Env vars**: Pulled from Vercel (`vercel env pull .env.local`)
- Git remote: `git@github.com:codyz123/podcastomatic.git`
- **Always submit PRs, never push directly to main.**

## Context+ (MCP)
Context+ is configured in `.mcp.json` for semantic code search. Use it in Claude Code / Cursor to search the codebase without reading everything.
