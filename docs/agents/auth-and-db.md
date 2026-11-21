# Auth (Spotify login) + Database

Users sign in with Spotify via Auth.js. One row per user lives in Postgres (local Docker for now, Supabase later), including Spotify tokens, so server code can call the Spotify API on their behalf.

## Setup
- Env (`.env.local`; template in `.env.example`): `AUTH_SECRET` (`npx auth secret`), `AUTH_SPOTIFY_ID`, `AUTH_SPOTIFY_SECRET`, `DATABASE_URL` (local: `postgresql://postgres:postgres@127.0.0.1:5433/layla` after `docker compose up -d`; hosted: Supabase **transaction pooler**, port 6543).
- `npm run db:push` syncs `src/db/schema.ts` to the DB (no migration files). `npm run db:studio` browses the data.
- Spotify redirect URI: `http://127.0.0.1:3000/api/auth/callback/spotify`. Open the app at **127.0.0.1**, not localhost, and leave `AUTH_URL` unset locally. On a phone/deploy, set `AUTH_URL=https://<host>` and register that callback.

## Code
- `src/db/schema.ts`: `users` (`id` uuid, `spotifyId` unique, profile fields, `accessToken`/`refreshToken`/`tokenExpiresAt`, approximate `lat`/`lng`/`locationUpdatedAt`; see [location.md](location.md)). Add new tables here.
- `src/db/index.ts`: `db` (Drizzle, postgres-js, `prepare: false` for the pooler). `import { db, users } from "@/db"`.
- `src/auth.ts`: Auth.js config, with JWT sessions and no adapter. The `jwt` callback upserts `users` on sign-in. Exports `auth`, `signIn`, `signOut`, `handlers`.
- `src/app/api/auth/[...nextauth]/route.ts`: Auth.js routes. Rebuilds the URL from the `Host` header because Next rewrites 127.0.0.1 to localhost, which breaks Spotify's redirect URI check.
- `src/proxy.ts`: sends `localhost` visitors to `127.0.0.1`, so Spotify's redirect URI always matches.
- `src/app/actions.ts`: server actions `connectSpotify` and `logOut`.
- `src/lib/spotify.ts`: `spotifyFetch(userId, path)` (auto token refresh, returns `null` on 204, throws `SpotifyApiError` with `.status`/`.needsReauth`), plus typed helpers on `spotify.*`: `me`, `topArtists`/`topTracks(userId, range)`, `recentlyPlayed`, `currentlyPlaying`, `savedTracks`, `savedAlbums`, `playlists`, `followedArtists`, `savedShows`. Use these for all Spotify API calls.
- `src/app/spotify-overview.tsx`: the main page's "everything Spotify gives us" view. It reads **stored** data; see [sync.md](sync.md). Pages shouldn't call `spotify.*` live.

## Usage
```ts
import { auth } from "@/auth";
import { spotify } from "@/lib/spotify";

const session = await auth();              // null when signed out
const userId = session?.user.id;           // our users.id (uuid)
const recent = await spotify.recentlyPlayed(userId!, 50);   // or spotifyFetch(userId!, "/me/...")
```

## Next 16 gotchas
- `next.config.ts` has `allowedDevOrigins: ["127.0.0.1"]`. Without it, the dev server blocks its HMR connection for 127.0.0.1 and **client components never start**: no polling, no share button, no effects. Add your tunnel host there too if you use one (e.g. ngrok).
- `cacheComponents` is on, so any component calling `auth()` must sit inside `<Suspense>` and call `await connection()` first. Auth.js generates random values during the call, which breaks prerendering. See `Account` in `src/app/page.tsx`.
- Scopes are listed in `SPOTIFY_SCOPES` (`src/auth.ts`). After adding a scope, users must reconnect: the endpoint returns 401/403, `needsReauth` is true, and the page shows a Reconnect button.
- Spotify no longer returns artist `genres`/`popularity`/`followers` or track `popularity` for new apps, and audio-features/recommendations/related-artists endpoints are unavailable. Don't build on them.
