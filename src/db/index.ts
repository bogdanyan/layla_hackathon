import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reuse one connection pool across dev hot-reloads and warm serverless invocations (Vercel).
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

// Supabase's transaction pooler (port 6543, Supavisor) needs:
// - prepare: false (no named prepared statements);
// - max_pipeline: 1: older Supavisor hangs forever on pipelined queries (seen in prod: a parallel
//   Spotify sync never finished). One query in flight per connection; extra queries wait for a free one.
// - query_timeout: if the pooler still stops answering, fail after 20 s instead of hanging the page.
const client =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max_pipeline: 1,
    query_timeout: 20,
    // Every Vercel function instance opens its own pool, so keep it small there.
    max: process.env.VERCEL ? 5 : 10,
  });
globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export * from "./schema";
