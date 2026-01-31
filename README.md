# Podcast Clipper

A web app for creating short-form video clips from podcast episodes. Built for a small group of podcast collaborators.

## What It Does

1. **Import** - Upload podcast audio (MP3, WAV, M4A, FLAC, OGG, AIF)
2. **Transcribe** - AI transcription with word-level timestamps (OpenAI Whisper)
3. **Select Clips** - AI suggests engaging moments, or pick your own
4. **Export** - Generate videos with animated subtitles for social platforms

## Video Formats

| Format | Resolution | Platforms |
|--------|------------|-----------|
| 9:16 Vertical | 1080x1920 | TikTok, Instagram Reels, YouTube Shorts |
| 1:1 Square | 1080x1080 | Instagram Posts, Twitter/X |
| 16:9 Landscape | 1920x1080 | YouTube, Twitter/X, LinkedIn |

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Open http://localhost:1420
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details on the planned backend.

**Current state**: Frontend-only, API key stored in browser localStorage.

**Target state**: Backend proxies all OpenAI calls, single API key stored as server environment variable.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Radix UI
- **Video**: Remotion for programmatic video generation
- **AI**: OpenAI Whisper (transcription), GPT-4 (clip suggestions)
- **State**: Zustand with localStorage persistence
- **Storage**: IndexedDB for audio files (browser-side)

## Who This Is For

This is a private tool for a small group of 3-7 trusted podcast collaborators. It's not a commercial product and won't have paid tiers or public sign-up.

## License

MIT
