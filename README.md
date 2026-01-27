# Podcast Clipper

Create engaging short-form video clips from podcast episodes automatically.

## Features

- **Audio Import**: Drag-and-drop support for MP3, WAV, M4A, FLAC, and OGG files
- **AI Transcription**: Automatic transcription using OpenAI Whisper with word-level timestamps
- **Smart Clip Selection**: AI-powered analysis to find the most engaging moments
- **Multi-Format Export**: Generate videos for TikTok, Instagram Reels, YouTube Shorts, and more
- **Animated Subtitles**: Word-by-word subtitle animations with customizable styles
- **Video Templates**: Built-in templates with customizable backgrounds and text styles
- **Cross-Platform**: Available for macOS and Windows

## Video Formats

| Format | Resolution | Platforms |
|--------|------------|-----------|
| 9:16 Vertical | 1080x1920 | TikTok, Instagram Reels, YouTube Shorts |
| 1:1 Square | 1080x1080 | Instagram Posts, Twitter/X |
| 16:9 Landscape | 1920x1080 | YouTube, Twitter/X, LinkedIn |
| 4:5 Portrait | 1080x1350 | Instagram Feed |

## Requirements

- **OpenAI API Key**: Required for transcription (Whisper) and clip analysis (GPT-4)
- **Node.js 18+**: For development
- **Rust**: For building the Tauri backend

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd podcast-clipper
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run tauri dev
   ```

## Building for Production

### macOS
```bash
npm run tauri build
```
This creates a `.dmg` installer in `src-tauri/target/release/bundle/dmg/`

### Windows
```bash
npm run tauri build
```
This creates an `.exe` installer in `src-tauri/target/release/bundle/nsis/`

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build frontend for production |
| `npm run tauri dev` | Run full app in development mode |
| `npm run tauri build` | Build production installers |
| `npm run remotion:studio` | Open Remotion Studio for video preview |

## Configuration

On first launch, navigate to Settings and enter your:

1. **OpenAI API Key** - Get one at [platform.openai.com](https://platform.openai.com/api-keys)

Optional integrations:
- YouTube OAuth credentials for direct upload
- Twitter/X API keys for direct upload

## How It Works

1. **Import**: Upload your podcast audio file
2. **Transcribe**: AI transcribes the audio with word-level timing
3. **Analyze**: GPT-4 identifies the most engaging clip-worthy moments
4. **Preview**: Review clips with different templates and formats
5. **Export**: Generate videos and upload to social platforms

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Radix UI
- **Desktop**: Tauri 2.0 (Rust)
- **Video**: Remotion for programmatic video generation
- **AI**: OpenAI Whisper (transcription), GPT-4 (analysis)
- **State**: Zustand with persistence

## License

MIT
