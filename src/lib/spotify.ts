import { eq } from "drizzle-orm";
import { db, users } from "@/db";

const SPOTIFY_API = "https://api.spotify.com/v1";

/** Returns a valid Spotify access token for the user, refreshing it if it's about to expire. */
export async function getSpotifyAccessToken(userId: string): Promise<string> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.refreshToken) throw new Error("User has no Spotify connection");

  const expiresSoon =
    !user.accessToken || !user.tokenExpiresAt || user.tokenExpiresAt.getTime() - Date.now() < 60_000;
  if (!expiresSoon) return user.accessToken!;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${process.env.AUTH_SPOTIFY_ID}:${process.env.AUTH_SPOTIFY_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: user.refreshToken }),
  });
  if (!res.ok) throw new Error(`Spotify token refresh failed: ${res.status} ${await res.text()}`);

  const data: { access_token: string; expires_in: number; refresh_token?: string } = await res.json();
  await db
    .update(users)
    .set({
      accessToken: data.access_token,
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      // Spotify may rotate the refresh token.
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    })
    .where(eq(users.id, userId));

  return data.access_token;
}

/** GET a Spotify Web API path (e.g. "/me/player/recently-played") on behalf of a user. */
export async function spotifyFetch<T = unknown>(userId: string, path: string): Promise<T> {
  const token = await getSpotifyAccessToken(userId);
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify API ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}
