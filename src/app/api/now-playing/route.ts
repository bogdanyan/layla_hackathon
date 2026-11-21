import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, users } from "@/db";
import { refreshNowPlaying } from "@/lib/sync";

/** Current user's now-playing. Polled by <NowPlaying />; Spotify is hit at most once per NOW_PLAYING_TTL_MS. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  await refreshNowPlaying(userId).catch((e) => console.error("[now-playing]", e));
  const [row] = await db.select({ nowPlaying: users.nowPlaying }).from(users).where(eq(users.id, userId));
  return Response.json({ nowPlaying: row?.nowPlaying ?? null });
}
