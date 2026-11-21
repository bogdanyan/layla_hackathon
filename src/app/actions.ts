"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { auth, signIn, signOut } from "@/auth";
import { syncUser } from "@/lib/sync";
import { refreshVibe } from "@/lib/vibe";

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
