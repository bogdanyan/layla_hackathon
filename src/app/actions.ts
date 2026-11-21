"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { after } from "next/server";
import { auth, signIn, signOut } from "@/auth";
import { db, users } from "@/db";
import { syncUser } from "@/lib/sync";
import { refreshSummary, refreshVibe } from "@/lib/vibe";

export async function connectSpotify() {
  await signIn("spotify", { redirectTo: "/" });
}

export async function logOut() {
  await signOut({ redirectTo: "/" });
}

/** "Refresh" button: re-sync from Spotify now, then update the vibe in the background. */
export async function refreshSpotify() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;
  await syncUser(userId, { force: true });
  after(() => refreshVibe(userId).catch((e) => console.error("[vibe]", e)));
  refresh();
}

/** Saves the browser's IANA timezone so stats like "peak listening time" use local hours. */
export async function setTimezone(timezone: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }); // throws on invalid zones
  } catch {
    throw new Error("Invalid timezone");
  }
  const userId = session.user.id;
  const [before] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
  if (before?.timezone === timezone) return;
  await db.update(users).set({ timezone }).where(eq(users.id, userId));
  // The summary mentions time of day: regenerate it once with local hours instead of UTC.
  after(() => refreshSummary(userId, { force: true }).catch((e) => console.error("[summary]", e)));
}
