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

export class SpotifyApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    message: string,
  ) {
    super(message);
  }
  /** True when the user must sign in again to grant a scope we added later. */
  get needsReauth() {
    return this.status === 401 || this.status === 403;
  }
}

/** GET a Spotify Web API path (e.g. "/me/player/recently-played") on behalf of a user. Returns null on 204. */
export async function spotifyFetch<T = unknown>(userId: string, path: string): Promise<T> {
  const token = await getSpotifyAccessToken(userId);
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 204) return null as T;
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = (await res.json()).error?.message ?? message;
    } catch {}
    throw new SpotifyApiError(res.status, path, message);
  }
  return res.json() as Promise<T>;
}

// ---- Types (only the fields we use; Spotify no longer returns genres/popularity for new apps) ----

export type SpotifyImage = { url: string; width: number | null; height: number | null };
type Link = { external_urls: { spotify: string } };

export type SpotifyUser = Link & {
  id: string;
  display_name: string | null;
  email?: string;
  country?: string;
  product?: string;
  followers?: { total: number };
  images?: SpotifyImage[];
};
export type SpotifyArtist = Link & {
  id: string;
  name: string;
  images?: SpotifyImage[];
  genres?: string[];
  popularity?: number;
  followers?: { total: number };
};
export type SpotifyAlbum = Link & {
  id: string;
  name: string;
  images: SpotifyImage[];
  release_date?: string;
  artists: { id: string; name: string }[];
};
export type SpotifyTrack = Link & {
  id: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  artists: { id: string; name: string }[];
  album: SpotifyAlbum;
};
export type SpotifyPlaylist = Link & {
  id: string;
  name: string;
  images: SpotifyImage[] | null;
  owner: { display_name: string | null };
  tracks?: { total: number };
  items?: { total: number }; // newer API name for `tracks`
};
export type SpotifyShow = Link & { id: string; name: string; publisher: string; images: SpotifyImage[] };
export type Paging<T> = { items: T[]; total: number; next: string | null };
export type TimeRange = "short_term" | "medium_term" | "long_term";

// ---- Endpoints ----

export const spotify = {
  me: (userId: string) => spotifyFetch<SpotifyUser>(userId, "/me"),
  topArtists: (userId: string, range: TimeRange = "medium_term", limit = 20) =>
    spotifyFetch<Paging<SpotifyArtist>>(userId, `/me/top/artists?time_range=${range}&limit=${limit}`),
  topTracks: (userId: string, range: TimeRange = "medium_term", limit = 20) =>
    spotifyFetch<Paging<SpotifyTrack>>(userId, `/me/top/tracks?time_range=${range}&limit=${limit}`),
  recentlyPlayed: (userId: string, limit = 50) =>
    spotifyFetch<{ items: { track: SpotifyTrack; played_at: string }[] }>(
      userId,
      `/me/player/recently-played?limit=${limit}`,
    ),
  /** null when nothing is playing. */
  currentlyPlaying: (userId: string) =>
    spotifyFetch<{ is_playing: boolean; progress_ms: number | null; item: SpotifyTrack | null } | null>(
      userId,
      "/me/player/currently-playing",
    ),
  savedTracks: (userId: string, limit = 20) =>
    spotifyFetch<Paging<{ added_at: string; track: SpotifyTrack }>>(userId, `/me/tracks?limit=${limit}`),
  savedAlbums: (userId: string, limit = 20) =>
    spotifyFetch<Paging<{ added_at: string; album: SpotifyAlbum }>>(userId, `/me/albums?limit=${limit}`),
  playlists: (userId: string, limit = 20) =>
    spotifyFetch<Paging<SpotifyPlaylist>>(userId, `/me/playlists?limit=${limit}`),
  followedArtists: (userId: string, limit = 20) =>
    spotifyFetch<{ artists: Paging<SpotifyArtist> }>(userId, `/me/following?type=artist&limit=${limit}`),
  savedShows: (userId: string, limit = 20) =>
    spotifyFetch<Paging<{ show: SpotifyShow }>>(userId, `/me/shows?limit=${limit}`),
};
