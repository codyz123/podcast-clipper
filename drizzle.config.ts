import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import path from "node:path";

// Load local env for CLI usage (drizzle-kit doesn't auto-load .env.local)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Set it in .env.local.");
}

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
