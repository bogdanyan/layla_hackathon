import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so it doesn't load .env.local on its own.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is empty: set it in .env.local (Supabase → Connect → Transaction pooler).");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
