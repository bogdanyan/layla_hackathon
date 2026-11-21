import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";
import { db, users } from "@/db";

const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-read-private",
  "user-read-recently-played",
  "user-top-read",
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-follow-read",
].join(" ");

type SpotifyProfile = {
  id: string;
  display_name?: string | null;
  email?: string | null;
  images?: { url: string }[];
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Spotify({
      authorization: `https://accounts.spotify.com/authorize?scope=${encodeURIComponent(SPOTIFY_SCOPES)}`,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // Runs on sign-in (account + profile present) and on every session check.
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const p = profile as unknown as SpotifyProfile;
        const values = {
          spotifyId: p.id,
          displayName: p.display_name ?? null,
          email: p.email ?? null,
          imageUrl: p.images?.[0]?.url ?? null,
          accessToken: account.access_token ?? null,
          refreshToken: account.refresh_token ?? null,
          tokenExpiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
          lastSyncedAt: null, // force a fresh sync after (re)connecting, e.g. to pick up new scopes
        };
        const [user] = await db
          .insert(users)
          .values(values)
          .onConflictDoUpdate({ target: users.spotifyId, set: values })
          .returning({ id: users.id });
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      return session;
    },
  },
});
