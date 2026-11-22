import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so it doesn't load .env.local on its own.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// `npm run db:push:prod` sets DB_TARGET=prod to push to Supabase (DATABASE_URL_PROD) instead.
const prod = process.env.DB_TARGET === "prod";
const url = prod ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL;
if (!url) {
  throw new Error(`${prod ? "DATABASE_URL_PROD" : "DATABASE_URL"} is empty: set it in .env.local.`);
}
if (prod) console.log("Using production database (DATABASE_URL_PROD)");

export default defineConfig({
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url },
});
