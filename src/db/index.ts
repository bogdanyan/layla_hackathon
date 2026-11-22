import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reuse one connection pool across dev hot-reloads and warm serverless invocations (Vercel).
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

// prepare: false is required for Supabase's transaction pooler (port 6543).
const client =
  globalForDb.pgClient ??
  // Small pool: on Vercel every function instance opens its own connections to Supabase's pooler.
  postgres(process.env.DATABASE_URL!, { prepare: false, max: process.env.VERCEL ? 3 : 10 });
globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export * from "./schema";
