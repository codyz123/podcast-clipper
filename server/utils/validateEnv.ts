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
  { name: "R2_ACCOUNT_ID", required: false, description: "Cloudflare R2 account ID" },
  { name: "R2_ACCESS_KEY_ID", required: false, description: "Cloudflare R2 access key" },
  { name: "R2_SECRET_ACCESS_KEY", required: false, description: "Cloudflare R2 secret key" },
  { name: "R2_BUCKET_NAME", required: false, description: "Cloudflare R2 bucket name" },
  { name: "R2_PUBLIC_URL", required: false, description: "Cloudflare R2 public URL" },
  { name: "OPENAI_API_KEY", required: false, description: "OpenAI API key for transcription" },
  { name: "RESEND_API_KEY", required: false, description: "Resend API key for invitation emails" },
  {
    name: "RESEND_FROM_EMAIL",
    required: false,
    description: "Verified email address for sending invitations (e.g., noreply@yourdomain.com)",
  },
  {
    name: "APP_URL",
    required: false,
    description: "Frontend URL for email links (e.g., https://app.yourdomain.com)",
  },
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

  // Special warning for email configuration
  if (process.env.RESEND_API_KEY && !process.env.RESEND_FROM_EMAIL) {
    console.warn("=".repeat(60));
    console.warn("⚠️  EMAIL CONFIGURATION WARNING");
    console.warn("=".repeat(60));
    console.warn("");
    console.warn("RESEND_API_KEY is set, but RESEND_FROM_EMAIL is not configured.");
    console.warn("This means invitation emails will use Resend's testing domain,");
    console.warn("which can ONLY send emails to the Resend account owner.");
    console.warn("");
    console.warn("To send invitations to other users:");
    console.warn("1. Verify your domain at https://resend.com/domains");
    console.warn("2. Set RESEND_FROM_EMAIL to an email on your verified domain");
    console.warn("   Example: RESEND_FROM_EMAIL=noreply@yourdomain.com");
    console.warn("");
    console.warn("=".repeat(60) + "\n");
  }
}
