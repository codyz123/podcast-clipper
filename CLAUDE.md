# Podcastomatic - AI Instructions

## Environment Setup

This project uses automatic environment setup. When starting work:

```bash
npm install   # Automatically pulls env vars from Vercel
npm run dev:all
```

The `postinstall` hook runs `scripts/setup-env.sh` which:
1. Checks if `.env.local` already exists and is valid
2. If not, pulls environment variables from Vercel (using committed `.vercel/` project link)
3. Falls back to creating a template if Vercel pull fails

If the server fails to start, check the error message - `validateEnv()` runs at startup and tells you exactly which environment variables are missing.

### Manual Setup (if needed)

```bash
vercel env pull .env.local   # Pull from Vercel
npm run setup                 # Or run the setup script directly
```

---

## Pattern for Other Conductor Workspaces

To add this pattern to other projects:

1. **Create `scripts/setup-env.sh`:**
```bash
#!/bin/bash
ENV_FILE=".env.local"

if [ -f "$ENV_FILE" ] && grep -q "^DATABASE_URL=" "$ENV_FILE"; then
    exit 0  # Already configured
fi

if [ -d ".vercel" ]; then
    vercel env pull "$ENV_FILE" --yes 2>/dev/null && exit 0
fi

echo "DATABASE_URL=" > "$ENV_FILE"
echo "Created $ENV_FILE - add credentials"
```

2. **Add to `package.json`:**
```json
"scripts": {
  "postinstall": "bash scripts/setup-env.sh",
  "setup": "bash scripts/setup-env.sh"
}
```

3. **Commit `.vercel/` folder** - remove it from `.gitignore`

4. **Add server startup validation** - fail fast with clear errors if env vars missing
