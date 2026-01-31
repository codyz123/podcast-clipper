# Architecture

## Overview

Podcast Clipper is a web app for creating short video clips from podcast audio. It's designed for a small, trusted group of podcast collaborators (3-7 people).

## Current State (Phase 1)

```
┌─────────────┐         ┌─────────────┐
│   Browser   │────────▶│   OpenAI    │
│  (React)    │         │    API      │
└─────────────┘         └─────────────┘
      │
      ▼
┌─────────────┐
│  IndexedDB  │  (audio files)
│ localStorage│  (projects, settings, API key)
└─────────────┘
```

**Limitations:**
- Each user needs their own OpenAI API key
- API key stored in browser (not ideal)
- No shared projects between users
- Audio files stored locally in browser

## Target State (Phase 2)

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Browser   │────────▶│   Backend   │────────▶│   OpenAI    │
│  (React)    │         │  (Node.js)  │         │    API      │
└─────────────┘         └─────────────┘         └─────────────┘
                              │
                              ▼
                        ┌─────────────┐
                        │  Storage    │
                        │ (S3/R2/DB)  │
                        └─────────────┘
```

**Benefits:**
- Single API key (stored as server env var)
- Users don't need their own keys
- Shared projects possible
- Better security

## Backend Plan

### Tech Choices

For a small trusted group, keep it simple:

| Component | Choice | Why |
|-----------|--------|-----|
| Runtime | Node.js | Same language as frontend |
| Framework | Express or Hono | Simple, well-documented |
| Database | SQLite or Postgres | SQLite for simplicity, Postgres if we need more |
| File Storage | Local disk or S3/R2 | Start with local, move to S3 if needed |
| Hosting | Railway, Render, or Fly.io | Easy deploys, free/cheap tiers |
| Auth | Simple shared code | Since users are trusted friends |

### API Endpoints

```
POST /api/transcribe
  - Receives: audio file (multipart form)
  - Returns: transcript with word timestamps
  - Calls OpenAI Whisper internally

POST /api/suggest-clips
  - Receives: transcript text
  - Returns: suggested clip timestamps
  - Calls OpenAI GPT-4 internally

POST /api/projects
GET /api/projects
GET /api/projects/:id
  - CRUD for projects (if we want shared state)
```

### Environment Variables

```
OPENAI_API_KEY=sk-...
ACCESS_CODE=shared-secret-for-friends  # Simple auth
PORT=3001
```

### Simple Auth

Since this is for trusted friends only:

1. **Option A: Shared access code**
   - Single code everyone uses
   - Stored in env var, entered once in browser
   - Good enough for 3-7 trusted people

2. **Option B: Allowlist**
   - List of allowed email addresses
   - Magic link or simple password per user
   - Slightly more tracking of who's who

Recommend **Option A** for simplicity.

## Migration Path

### Step 1: Add backend with transcription endpoint
- Create `/api/transcribe` that proxies to OpenAI
- Frontend sends audio to backend instead of OpenAI directly
- Remove API key from frontend settings

### Step 2: Add simple auth
- Add access code check
- Store code in env var

### Step 3: (Optional) Add shared storage
- Move audio files to server/S3
- Add project persistence to database
- Enable collaboration features

## File Structure (Proposed)

```
podcast-clipper/
├── src/                    # Frontend (existing)
├── server/                 # Backend (new)
│   ├── index.ts
│   ├── routes/
│   │   ├── transcribe.ts
│   │   └── projects.ts
│   └── middleware/
│       └── auth.ts
├── package.json            # Add server scripts
└── docs/
    └── ARCHITECTURE.md
```

## Cost Estimate

For 3-7 users making occasional clips:

| Service | Cost |
|---------|------|
| OpenAI Whisper | ~$0.006/min audio |
| OpenAI GPT-4 | ~$0.01-0.03 per clip suggestion |
| Hosting (Railway free tier) | $0 |
| **Monthly estimate** | $5-20 depending on usage |

Very affordable to cover personally for friends.
