#!/bin/bash

# Environment setup script for podcastomatic
# Runs automatically on npm install via postinstall hook
# Pulls from Vercel if linked, otherwise creates from template

ENV_FILE=".env.local"
QUIET=${QUIET:-false}

# Check if already set up with valid config
if [ -f "$ENV_FILE" ]; then
    if grep -q "^DATABASE_URL=postgresql" "$ENV_FILE"; then
        # Already configured - exit silently for postinstall
        exit 0
    fi
fi

# From here, we need to do actual setup work - show output
echo ""
echo "Setting up environment variables..."

# Try to pull from Vercel first (the permanent solution)
if [ -d ".vercel" ]; then
    echo "Pulling from Vercel..."
    if vercel env pull "$ENV_FILE" --yes 2>/dev/null; then
        echo "Done! Environment variables pulled from Vercel."
        exit 0
    else
        echo "Could not pull from Vercel, creating from template..."
    fi
else
    echo "No Vercel project linked. Run 'vercel link' to enable auto-setup."
    echo "Creating from template..."
fi

# Fallback: create from template
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

cat > "$ENV_FILE" << EOF
# Server configuration
PORT=3001

# Database (Neon Postgres - REQUIRED)
# Get this from https://neon.tech or through Vercel's Neon integration
DATABASE_URL=

# JWT Authentication (auto-generated)
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET

# Vercel Blob storage (required for media uploads)
BLOB_READ_WRITE_TOKEN=

# OpenAI API key (required for transcription)
OPENAI_API_KEY=

# Frontend URL
FRONTEND_URL=http://localhost:1420

# Email (Resend)
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@resend.dev
APP_URL=http://localhost:1420
EOF

echo ""
echo "Created $ENV_FILE but DATABASE_URL is missing!"
echo "Add your DATABASE_URL from Neon, then run: npm run dev:all"
echo ""
