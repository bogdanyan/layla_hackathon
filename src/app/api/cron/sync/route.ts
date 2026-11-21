import { db, users } from "@/db";
import { syncUser } from "@/lib/sync";
import { refreshVibe } from "@/lib/vibe";

// Periodic sync for all users (captures listening history even when they don't open the app).
// Call with: curl -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/sync
// Vercel Cron sends this header automatically when CRON_SECRET is set.
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const all = await db.select({ id: users.id }).from(users);
  const results = [];
  // Sequential on purpose: few users, and it keeps us far from Spotify rate limits.
  for (const { id } of all) {
    try {
      const synced = await syncUser(id);
      const vibe = await refreshVibe(id);
      results.push({ id, synced, vibe: vibe?.vibe.title ?? null });
    } catch (e) {
      results.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json({ users: results.length, results });
}
