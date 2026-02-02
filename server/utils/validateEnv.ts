/**
 * Environment variable validation
 * Fails fast at startup with clear instructions if required vars are missing
 */

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  { name: "DATABASE_URL", required: true, description: "Neon Postgres connection string" },
  { name: "JWT_SECRET", required: true, description: "Secret for signing access tokens" },
  { name: "JWT_REFRESH_SECRET", required: true, description: "Secret for signing refresh tokens" },
  { name: "BLOB_READ_WRITE_TOKEN", required: false, description: "Vercel Blob storage token" },
  { name: "OPENAI_API_KEY", required: false, description: "OpenAI API key for transcription" },
  { name: "RESEND_API_KEY", required: false, description: "Resend API key for invitation emails" },
];

export function validateEnv(): void {
  const missing: EnvVar[] = [];
  const optional: EnvVar[] = [];

  for (const envVar of ENV_VARS) {
    if (!process.env[envVar.name]) {
      if (envVar.required) {
        missing.push(envVar);
      } else {
        optional.push(envVar);
      }
    }
  }

  if (missing.length > 0) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ MISSING REQUIRED ENVIRONMENT VARIABLES");
    console.error("=".repeat(60));
    console.error("\nThe following required environment variables are not set:\n");

    for (const envVar of missing) {
      console.error(`  • ${envVar.name}`);
      console.error(`    ${envVar.description}\n`);
    }

    console.error("-".repeat(60));
    console.error("TO FIX THIS:\n");
    console.error("1. Copy the example env file:");
    console.error("   cp .env.example .env.local\n");
    console.error("2. Edit .env.local and fill in the required values\n");
    console.error("3. For JWT secrets, you can generate them with:");
    console.error("   openssl rand -hex 32\n");
    console.error("=".repeat(60) + "\n");

    process.exit(1);
  }

  if (optional.length > 0) {
    console.warn("\n⚠️  Optional environment variables not set:");
    for (const envVar of optional) {
      console.warn(`   • ${envVar.name} - ${envVar.description}`);
    }
    console.warn("   Some features may not work without these.\n");
  }
}
